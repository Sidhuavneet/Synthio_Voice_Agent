"""LiveKit agent worker entry point (``synthio-agent dev|start|console``)."""

import functools
import logging

from dotenv import load_dotenv
from livekit.agents import (
    NOT_GIVEN,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    TurnHandlingOptions,
    cli,
    inference,
)

from synthio_backend.agent.deck_selection import select_deck
from synthio_backend.agent.navigation import handle_navigate
from synthio_backend.agent.presenter import PresenterAgent
from synthio_backend.agent.protocol import (
    DECK_ID_ATTRIBUTE,
    NAVIGATE_RPC_METHOD,
    SLIDE_INDEX_ATTRIBUTE,
)
from synthio_backend.agent.slides import SlideController
from synthio_backend.core.config import ENV_FILE, Settings, get_settings
from synthio_backend.decks.repository import DeckRepository

# The LiveKit CLI and Inference clients read LIVEKIT_* from the process environment.
load_dotenv(ENV_FILE)

logger = logging.getLogger(__name__)

# Headroom over one next_slide call per slide so a full presentation can chain without
# hitting the per-turn tool step limit.
_EXTRA_TOOL_STEPS = 2

_DECK_REPOSITORY_KEY = "deck_repository"


def _prewarm(proc: JobProcess) -> None:
    # Load and validate decks once per process so a broken deck file fails at startup.
    proc.userdata[_DECK_REPOSITORY_KEY] = DeckRepository.from_directory(get_settings().decks_dir)


server = AgentServer(setup_fnc=_prewarm)


def _build_session(settings: Settings, slide_count: int) -> AgentSession[None]:
    return AgentSession(
        stt=settings.stt_model,
        llm=settings.llm_model,
        tts=inference.TTS(model=settings.tts_model, voice=settings.tts_voice or NOT_GIVEN),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            interruption={"enabled": True, "mode": "adaptive"},
        ),
        max_tool_steps=slide_count + _EXTRA_TOOL_STEPS,
    )


@server.rtc_session(agent_name=get_settings().agent_name)
async def presenter_session(ctx: JobContext) -> None:
    settings = get_settings()
    repository: DeckRepository = ctx.proc.userdata[_DECK_REPOSITORY_KEY]
    deck = select_deck(repository, ctx.job.metadata)
    ctx.log_context_fields = {"room": ctx.room.name, "deck": deck.id}

    await ctx.connect()
    participant = ctx.room.local_participant
    await participant.set_attributes({DECK_ID_ATTRIBUTE: deck.id, SLIDE_INDEX_ATTRIBUTE: "0"})

    async def publish_slide_index(index: int) -> None:
        await participant.set_attributes({SLIDE_INDEX_ATTRIBUTE: str(index)})

    slides = SlideController(len(deck.slides), on_change=publish_slide_index)
    presenter = PresenterAgent(deck, slides)
    # Registered before start so early calls get a contract error reply, not "unsupported".
    participant.register_rpc_method(
        NAVIGATE_RPC_METHOD, functools.partial(handle_navigate, presenter)
    )
    session = _build_session(settings, len(deck.slides))
    await session.start(agent=presenter, room=ctx.room)
    logger.info("presenting deck %s", deck.id)


def run() -> None:
    cli.run_app(server)
