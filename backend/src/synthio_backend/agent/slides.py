"""Framework-independent state holder for the slide on screen."""

import asyncio
from collections.abc import Awaitable, Callable

OnSlideChange = Callable[[int], Awaitable[None]]


class SlideIndexError(ValueError):
    """Requested slide index is outside the deck."""


class SlideController:
    def __init__(
        self, slide_count: int, on_change: OnSlideChange | None = None, start: int = 0
    ) -> None:
        if slide_count < 1:
            raise ValueError("slide_count must be at least 1")
        self._slide_count = slide_count
        self._on_change = on_change
        self.validate(start)
        self._index = start
        # Serialises changes so attribute updates reach the room in order.
        self._lock = asyncio.Lock()

    @property
    def index(self) -> int:
        return self._index

    @property
    def slide_count(self) -> int:
        return self._slide_count

    def validate(self, index: int) -> None:
        if not 0 <= index < self._slide_count:
            raise SlideIndexError(
                f"Slide index {index} is out of range; valid indices are 0 to "
                f"{self._slide_count - 1}"
            )

    async def go_to(self, index: int) -> int:
        async with self._lock:
            self.validate(index)
            if index != self._index:
                self._index = index
                if self._on_change is not None:
                    await self._on_change(index)
        return index
