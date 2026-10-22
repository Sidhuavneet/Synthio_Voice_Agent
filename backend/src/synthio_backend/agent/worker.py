"""LiveKit agent worker entry point (``synthio-agent dev|start|console``)."""

import asyncio
import functools
import logging
import time
from typing import Any

from livekit.agents import (
    AgentServer,
    AgentSession,
    AgentStateChangedEvent,
    CloseEvent,
    CloseReason,
    ConversationItemAddedEvent,
    ErrorEvent,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    TurnHandlingOptions,
    UserStateChangedEvent,
    cli,
    inference,
    llm,
    room_io,
)

from synthio_backend.agent.adapters import RoomProgress, SessionSpeech, presented_attribute
from synthio_backend.agent.deck_selection import select_job
from synthio_backend.agent.errors import session_error_event
from synthio_backend.agent.events import (
    InterruptionEvent,
    RoomEventPublisher,
    SessionErrorEvent,
    SlideChangedEvent,
)
from synthio_backend.agent.interrupt import handle_interrupt
from synthio_backend.agent.navigation import handle_navigate
from synthio_backend.agent.presentation import (
    MAX_ENDPOINTING_DELAY_S,
    NO_POINT,
    PresentationController,
)
from synthio_backend.agent.presenter import PresenterAgent
from synthio_backend.agent.protocol import (
    DECK_ID_ATTRIBUTE,
    INTERRUPT_RPC_METHOD,
    NAVIGATE_RPC_METHOD,
    PRESENTATION_STATE_ATTRIBUTE,
    REPORT_RPC_METHOD,
    SLIDE_INDEX_ATTRIBUTE,
    SLIDE_POINT_ATTRIBUTE,
    SLIDE_PRESENTED_ATTRIBUTE,
)
from synthio_backend.agent.providers import (
    build_stt,
    build_tts,
    build_turn_detector,
    describe_providers,
    llm_chain,
    with_llm_fallback,
)
from synthio_backend.agent.report import SessionReporter, handle_report, llm_completer
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideChange, SlideController
from synthio_backend.agent.turn_metrics import TurnMetricsAggregator
from synthio_backend.core.config import Settings, get_settings, load_env_files
from synthio_backend.decks.repository import DeckRepository
from synthio_backend.session.warmup import is_warmup, start_self_ping

load_env_files()

logger = logging.getLogger(__name__)

_DECK_REPOSITORY_KEY = "deck_repository"

# A cold job process (imports plus the framework's local model preloading) can take well over
# the 10 s default to initialise on a busy Windows machine. Timing out fails the first dispatch
# and the retry adds about 30 s before the agent joins.
_INITIALIZE_PROCESS_TIMEOUT_S = 60.0
# Upper bound for delivering the session_error packet before the agent leaves the room.
_ERROR_SEND_TIMEOUT_S = 5.0


def _prewarm(proc: JobProcess) -> None:
    settings = get_settings()
    # Load and validate decks once per process so a broken deck file fails at startup.
    proc.userdata[_DECK_REPOSITORY_KEY] = DeckRepository.from_directory(settings.decks_dir)
    logger.info("provider failover chains: %s", describe_providers(settings))


server = AgentServer(setup_fnc=_prewarm, initialize_process_timeout=_INITIALIZE_PROCESS_TIMEOUT_S)


def _build_session(settings: Settings, model: llm.LLM[Any]) -> AgentSession[None]:
    return AgentSession(
        stt=build_stt(settings),
        llm=model,
        tts=build_tts(settings),
        turn_handling=TurnHandlingOptions(
            turn_detection=build_turn_detector(),
            # Set explicitly: the presentation's timers allow for this commit window.
            endpointing={"max_delay": MAX_ENDPOINTING_DELAY_S},
            # Adaptive barge-in runs on LiveKit Inference; on an unrecoverable error (such
            # as a spent quota) LiveKit falls back to local VAD interruption by itself.
            interruption={"enabled": True, "mode": "adaptive"},
        ),
    )


class _SessionFailure:
    """Publishes one ``session_error`` event, then shuts the job down so the agent leaves."""

    def __init__(self, ctx: JobContext, events: RoomEventPublisher) -> None:
        self._ctx = ctx
        self._events = events
        self._task: asyncio.Task[None] | None = None

    def fail(self, event: SessionErrorEvent) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._fail(event))

    async def _fail(self, event: SessionErrorEvent) -> None:
        logger.error("ending session after unrecoverable error: %s", event.code)
        try:
            async with asyncio.timeout(_ERROR_SEND_TIMEOUT_S):
                await self._events.send(event)
        except TimeoutError:
            logger.warning("session_error event was not delivered in time")
        self._ctx.shutdown(reason=f"session error: {event.code}")


def _observe_session(
    session: AgentSession[None],
    log: SessionLog,
    slides: SlideController,
    events: RoomEventPublisher,
    presentation: PresentationController,
    failure: _SessionFailure,
) -> None:
    """Feeds session signals to the presentation, the session log, turn metrics and the
    error path."""
    aggregator = TurnMetricsAggregator()

    def on_item_added(ev: ConversationItemAddedEvent) -> None:
        if isinstance(ev.item, llm.ChatMessage) and ev.item.role == "user":
            text = ev.item.text_content
            if text:
                log.record_user_turn(text, slides.index)

    def on_metrics(ev: MetricsCollectedEvent) -> None:
        turn = aggregator.add(ev.metrics)
        if turn is not None:
            events.publish(turn)

    def on_user_state(ev: UserStateChangedEvent) -> None:
        presentation.on_user_speaking(ev.new_state == "speaking")

    def on_agent_state(ev: AgentStateChangedEvent) -> None:
        presentation.on_agent_busy(ev.new_state in ("thinking", "speaking"))

    def on_overlapping_speech(ev: inference.OverlappingSpeechEvent) -> None:
        # Inconclusive when the agent simply finished first; an overlap that ended without
        # any model verdict was too short to matter (a cough, a click).
        if ev.agent_ended or (not ev.is_interruption and ev.total_duration <= 0):
            return
        events.publish(
            InterruptionEvent(
                kind="barge_in" if ev.is_interruption else "backchannel",
                slide_index=slides.index,
                point_index=presentation.narrating_point,
                detection_ms=round(ev.detection_delay * 1000),
                timestamp=round(ev.created_at * 1000),
            )
        )

    def on_error(ev: ErrorEvent) -> None:
        # LiveKit closes the session only after repeated unrecoverable errors; a spent quota
        # will not recover, so end at once instead of leaving the user on "listening".
        error = getattr(ev.error, "error", None)
        if getattr(ev.error, "recoverable", True) or not isinstance(error, BaseException):
            return
        event = session_error_event(error)
        if event.code == "quota_exceeded":
            failure.fail(event)

    def on_close(ev: CloseEvent) -> None:
        presentation.close()
        if ev.reason == CloseReason.ERROR:
            failure.fail(session_error_event(ev.error.error if ev.error is not None else None))

    session.on("conversation_item_added", on_item_added)
    # Deprecated in favour of ChatMessage.metrics, but it is the per-component stream the
    # contract's turn_metrics event is defined on.
    session.on("metrics_collected", on_metrics)
    session.on("user_state_changed", on_user_state)
    session.on("agent_state_changed", on_agent_state)
    # Only emitted by adaptive interruption; after a fallback to VAD, interruptions still
    # work but are not reported.
    session.on("overlapping_speech", on_overlapping_speech)
    session.on("error", on_error)
    session.on("close", on_close)


async def _on_text_input(
    presentation: PresentationController,
    session: AgentSession[None],
    ev: room_io.TextInputEvent,
) -> None:
    """Typed questions (the "Try asking" chips) take the same path as spoken ones. LiveKit's
    default callback skips ``on_user_turn_completed``, so the presentation is told here."""
    # Same as LiveKit's default callback (which documents _claim_user_turn for this use).
    async with session._claim_user_turn():
        presentation.on_user_turn()
        await session.interrupt()
        session.generate_reply(user_input=ev.text)


@server.rtc_session(agent_name=get_settings().agent_name)
async def presenter_session(ctx: JobContext) -> None:
    if is_warmup(ctx.job.metadata):
        # Keep-alive ping (see session/warmup.py): the dispatch itself is the activity.
        logger.info("warm-up job received; ending it")
        return
    settings = get_settings()
    repository: DeckRepository = ctx.proc.userdata[_DECK_REPOSITORY_KEY]
    job = select_job(repository, ctx.job.metadata)
    deck, resume = job.deck, job.resume
    start_slide = 0 if resume is None else resume.slide_index
    ctx.log_context_fields = {"room": ctx.room.name, "deck": deck.id}

    await ctx.connect()
    participant = ctx.room.local_participant
    await participant.set_attributes(
        {
            DECK_ID_ATTRIBUTE: deck.id,
            SLIDE_INDEX_ATTRIBUTE: str(start_slide),
            SLIDE_POINT_ATTRIBUTE: str(NO_POINT),
            PRESENTATION_STATE_ATTRIBUTE: "idle",
            SLIDE_PRESENTED_ATTRIBUTE: presented_attribute(
                [] if resume is None else sorted(set(resume.presented))
            ),
        }
    )

    log = SessionLog(start_slide=start_slide)
    events = RoomEventPublisher(participant)

    async def on_slide_change(change: SlideChange) -> None:
        log.record_slide(change.to_index)
        await participant.set_attributes({SLIDE_INDEX_ATTRIBUTE: str(change.to_index)})
        question = log.turns[-1].text if change.trigger == "question" and log.turns else None
        events.publish(
            SlideChangedEvent(
                from_index=change.from_index,
                to_index=change.to_index,
                trigger=change.trigger,
                reason=change.reason,
                question=question,
                timestamp=round(time.time() * 1000),
            )
        )

    slides = SlideController(len(deck.slides), on_change=on_slide_change, start=start_slide)
    models = llm_chain(settings)
    session = _build_session(settings, with_llm_fallback(models))
    presentation = PresentationController(
        deck, slides, SessionSpeech(session), RoomProgress(participant), resume=resume
    )
    presenter = PresenterAgent(deck, slides, presentation, log, events)
    _observe_session(session, log, slides, events, presentation, _SessionFailure(ctx, events))
    reporter = SessionReporter(
        deck, log, llm_completer(models), history=lambda: session.history.items
    )
    # Registered before start so early calls get a contract reply, not "unsupported".
    participant.register_rpc_method(
        NAVIGATE_RPC_METHOD, functools.partial(handle_navigate, presentation)
    )
    participant.register_rpc_method(
        INTERRUPT_RPC_METHOD, functools.partial(handle_interrupt, presentation)
    )
    participant.register_rpc_method(REPORT_RPC_METHOD, functools.partial(handle_report, reporter))
    await session.start(
        agent=presenter,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            text_input=room_io.TextInputOptions(
                text_input_cb=functools.partial(_on_text_input, presentation)
            )
        ),
    )
    logger.info("presenting deck %s from slide %d", deck.id, start_slide)


def run() -> None:
    settings = get_settings()
    if settings.self_ping_url:
        # Keeps the free-tier API awake while the agent runs (see session/warmup.py).
        start_self_ping(settings.self_ping_url, settings.self_ping_interval_s)
    cli.run_app(server)
