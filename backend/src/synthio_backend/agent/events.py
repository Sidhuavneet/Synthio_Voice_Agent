"""Agent -> frontend events, sent as reliable data packets (see docs/CONTRACT.md section 5)."""

import asyncio
import logging
from typing import Literal, Protocol

from livekit import rtc

from synthio_backend.agent.protocol import EVENTS_TOPIC
from synthio_backend.agent.slides import SlideTrigger
from synthio_backend.decks.models import CamelModel

logger = logging.getLogger(__name__)

ComplianceCategory = Literal[
    "off_label", "personal_medical_advice", "adverse_event", "out_of_scope"
]


class ComplianceFlagEvent(CamelModel):
    type: Literal["compliance_flag"] = "compliance_flag"
    id: str
    category: ComplianceCategory
    question: str
    slide_index: int
    timestamp: int
    """Epoch milliseconds."""


class TurnMetricsEvent(CamelModel):
    type: Literal["turn_metrics"] = "turn_metrics"
    turn_id: str
    stt_ms: int | None
    eou_ms: int | None
    llm_ttft_ms: int | None
    tts_ttfb_ms: int | None
    total_ms: int | None


class SlideChangedEvent(CamelModel):
    type: Literal["slide_changed"] = "slide_changed"
    from_index: int
    to_index: int
    trigger: SlideTrigger
    reason: str | None
    """The agent's short reason, for ``question`` jumps."""
    question: str | None
    """The user turn being answered, for ``question`` jumps."""
    timestamp: int
    """Epoch milliseconds."""


class InterruptionEvent(CamelModel):
    """The user spoke over the agent: a real barge-in, or a backchannel it talked through."""

    type: Literal["interruption"] = "interruption"
    kind: Literal["barge_in", "backchannel"]
    slide_index: int
    point_index: int | None
    """Point being narrated when the user spoke, or None (intro, answer, idle)."""
    detection_ms: int
    """From the onset of the user's speech to LiveKit's interruption verdict."""
    timestamp: int
    """Epoch milliseconds."""


SessionErrorCode = Literal["quota_exceeded", "provider_error", "internal"]


class SessionErrorEvent(CamelModel):
    type: Literal["session_error"] = "session_error"
    code: SessionErrorCode
    message: str
    """User-safe description."""


AgentEvent = (
    ComplianceFlagEvent
    | TurnMetricsEvent
    | SessionErrorEvent
    | SlideChangedEvent
    | InterruptionEvent
)


class EventSink(Protocol):
    def publish(self, event: AgentEvent) -> None: ...


class RoomEventPublisher:
    """Fire-and-forget publisher, callable from sync event callbacks and from tools."""

    def __init__(self, participant: rtc.LocalParticipant) -> None:
        self._participant = participant
        self._tasks: set[asyncio.Task[None]] = set()

    def publish(self, event: AgentEvent) -> None:
        task = asyncio.create_task(self.send(event))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def send(self, event: AgentEvent) -> None:
        """Sends now; for callers that must know the packet left before moving on."""
        try:
            await self._participant.publish_data(
                event.model_dump_json(by_alias=True), reliable=True, topic=EVENTS_TOPIC
            )
        # Events are best effort: a closed room or a full buffer must not break the session.
        except Exception:
            logger.warning("failed to publish %s event", event.type, exc_info=True)
