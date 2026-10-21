"""Facts recorded during a session, used to build the session report."""

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass

from synthio_backend.agent.events import ComplianceCategory, ComplianceFlagEvent

Clock = Callable[[], float]


@dataclass
class UserTurn:
    text: str
    slide_index: int
    """Slide on screen when the agent answered (updated when the agent jumps to a slide)."""


class SessionLog:
    def __init__(
        self, clock: Clock = time.monotonic, wall_clock: Clock = time.time, start_slide: int = 0
    ) -> None:
        self._clock = clock
        self._wall_clock = wall_clock
        self._started_at = clock()
        self._slide_index = start_slide
        self._slide_entered_at = self._started_at
        self._slide_seconds: dict[int, float] = {}
        self._turns: list[UserTurn] = []
        self._flags: list[ComplianceFlagEvent] = []

    @property
    def turns(self) -> tuple[UserTurn, ...]:
        return tuple(self._turns)

    @property
    def flags(self) -> tuple[ComplianceFlagEvent, ...]:
        return tuple(self._flags)

    def duration_seconds(self) -> float:
        return self._clock() - self._started_at

    def record_slide(self, index: int) -> None:
        """Called whenever the slide on screen changes."""
        now = self._clock()
        elapsed = now - self._slide_entered_at
        self._slide_seconds[self._slide_index] = (
            self._slide_seconds.get(self._slide_index, 0.0) + elapsed
        )
        self._slide_index = index
        self._slide_entered_at = now

    def slide_seconds(self) -> dict[int, float]:
        """Seconds each slide has been on screen, including the current one so far."""
        seconds = dict(self._slide_seconds)
        current = self._clock() - self._slide_entered_at
        seconds[self._slide_index] = seconds.get(self._slide_index, 0.0) + current
        return seconds

    def record_user_turn(self, text: str, slide_index: int) -> None:
        self._turns.append(UserTurn(text=text, slide_index=slide_index))

    def route_latest_turn(self, slide_index: int) -> None:
        """The agent moved to another slide to answer the latest user turn."""
        if self._turns:
            self._turns[-1].slide_index = slide_index

    def add_flag(
        self, category: ComplianceCategory, question: str, slide_index: int
    ) -> ComplianceFlagEvent:
        flag = ComplianceFlagEvent(
            id=f"flag_{uuid.uuid4().hex[:12]}",
            category=category,
            question=question,
            slide_index=slide_index,
            timestamp=round(self._wall_clock() * 1000),
        )
        self._flags.append(flag)
        return flag
