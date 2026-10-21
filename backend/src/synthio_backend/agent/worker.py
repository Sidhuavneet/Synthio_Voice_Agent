"""LiveKit agent worker entry point (``synthio-agent dev|start|console``)."""

import asyncio
import functools
import logging

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
    llm,
)

from synthio_backend.agent.adapters import RoomProgress, SessionSpeech, presented_attribute
from synthio_backend.agent.deck_selection import select_job
from synthio_backend.agent.errors import session_error_event
from synthio_backend.agent.events import RoomEventPublisher, SessionErrorEvent
from synthio_backend.agent.navigation import handle_navigate
from synthio_backend.agent.presentation import (
    MAX_ENDPOINTING_DELAY_S,
    NO_POINT,
    PresentationController,
)
from synthio_backend.agent.presenter import PresenterAgent
from synthio_backend.agent.protocol import (
    DECK_ID_ATTRIBUTE,
    NAVIGATE_RPC_METHOD,
    REPORT_RPC_METHOD,
    SLIDE_INDEX_ATTRIBUTE,
    SLIDE_POINT_ATTRIBUTE,
    SLIDE_PRESENTED_ATTRIBUTE,
)
from synthio_backend.agent.providers import (
    ChatLLM,
    build_llm,
    build_stt,
    build_tts,
    build_turn_detector,
    describe_providers,
)
from synthio_backend.agent.report import SessionReporter, handle_report, llm_completer
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideController
from synthio_backend.agent.turn_metrics import TurnMetricsAggregator
from synthio_backend.core.config import Settings, get_settings, load_env_files
from synthio_backend.decks.repository import DeckRepository

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
    logger.info("resolved providers: %s", describe_providers(settings))


server = AgentServer(setup_fnc=_prewarm, initialize_process_timeout=_INITIALIZE_PROCESS_TIMEOUT_S)


def _build_session(settings: Settings, model: ChatLLM) -> AgentSession[None]:
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
    session.on("error", on_error)
    session.on("close", on_close)


@server.rtc_session(agent_name=get_settings().agent_name)
async def presenter_session(ctx: JobContext) -> None:
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
            SLIDE_PRESENTED_ATTRIBUTE: presented_attribute(
                [] if resume is None else sorted(set(resume.presented))
            ),
        }
    )

    log = SessionLog(start_slide=start_slide)

    async def on_slide_change(index: int) -> None:
        log.record_slide(index)
        await participant.set_attributes({SLIDE_INDEX_ATTRIBUTE: str(index)})

    slides = SlideController(len(deck.slides), on_change=on_slide_change, start=start_slide)
    events = RoomEventPublisher(participant)
    model = build_llm(settings)
    session = _build_session(settings, model)
    presentation = PresentationController(
        deck, slides, SessionSpeech(session), RoomProgress(participant), resume=resume
    )
    presenter = PresenterAgent(deck, slides, presentation, log, events)
    _observe_session(session, log, slides, events, presentation, _SessionFailure(ctx, events))
    reporter = SessionReporter(
        deck, log, llm_completer(model), history=lambda: session.history.items
    )
    # Registered before start so early calls get a contract reply, not "unsupported".
    participant.register_rpc_method(
        NAVIGATE_RPC_METHOD, functools.partial(handle_navigate, presentation)
    )
    participant.register_rpc_method(REPORT_RPC_METHOD, functools.partial(handle_report, reporter))
    await session.start(agent=presenter, room=ctx.room)
    logger.info("presenting deck %s from slide %d", deck.id, start_slide)


def run() -> None:
    cli.run_app(server)
