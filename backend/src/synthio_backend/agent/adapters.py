"""LiveKit implementations of the presentation controller's ports."""

import asyncio
import logging
from collections.abc import Sequence

from livekit import rtc
from livekit.agents import AgentSession
from livekit.agents.voice import SpeechHandle

from synthio_backend.agent.protocol import SLIDE_POINT_ATTRIBUTE, SLIDE_PRESENTED_ATTRIBUTE

logger = logging.getLogger(__name__)


def presented_attribute(presented: Sequence[int]) -> str:
    return ",".join(str(index) for index in presented)


class SessionSpeech:
    def __init__(self, session: AgentSession[None]) -> None:
        self._session = session

    def say(self, text: str) -> SpeechHandle:
        return self._session.say(text, allow_interruptions=True, add_to_chat_ctx=True)

    def generate_reply(self, instructions: str) -> SpeechHandle:
        return self._session.generate_reply(instructions=instructions)

    async def interrupt(self) -> None:
        await self._session.interrupt(force=True)


class RoomProgress:
    """Publishes ``slide.point`` / ``slide.presented``; updates are sent in call order."""

    def __init__(self, participant: rtc.LocalParticipant) -> None:
        self._participant = participant
        self._tasks: set[asyncio.Task[None]] = set()

    def show_point(self, point: int) -> None:
        self._publish({SLIDE_POINT_ATTRIBUTE: str(point)})

    def show_presented(self, presented: Sequence[int]) -> None:
        self._publish({SLIDE_PRESENTED_ATTRIBUTE: presented_attribute(presented)})

    def _publish(self, attributes: dict[str, str]) -> None:
        task = asyncio.create_task(self._send(attributes))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _send(self, attributes: dict[str, str]) -> None:
        try:
            await self._participant.set_attributes(attributes)
        # Progress is best effort: a closed room must not break the presentation.
        except Exception:
            logger.warning("failed to publish attributes %s", attributes, exc_info=True)
