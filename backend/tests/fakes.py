"""Test doubles for the presentation controller's ports."""

import asyncio
from collections.abc import Sequence


class FakeHandle:
    def __init__(self, text: str) -> None:
        self.text = text
        self.interrupted = False
        self._done = asyncio.Event()

    @property
    def done(self) -> bool:
        return self._done.is_set()

    def finish(self) -> None:
        self._done.set()

    def interrupt(self, *, force: bool = False) -> "FakeHandle":
        if not self.done:
            self.interrupted = True
            self._done.set()
        return self

    async def wait_for_playout(self) -> None:
        await self._done.wait()


class FakeSpeech:
    """Each ``say`` plays until the test calls ``finish`` (or interrupts it)."""

    def __init__(self) -> None:
        self.handles: list[FakeHandle] = []
        self.replies: list[str] = []
        self.fail = False

    @property
    def said(self) -> list[str]:
        return [handle.text for handle in self.handles]

    @property
    def playing(self) -> FakeHandle | None:
        return next((h for h in reversed(self.handles) if not h.done), None)

    def say(self, text: str) -> FakeHandle:
        if self.fail:
            raise RuntimeError("AgentSession isn't running")
        handle = FakeHandle(text)
        self.handles.append(handle)
        return handle

    def generate_reply(self, instructions: str) -> FakeHandle:
        self.replies.append(instructions)
        handle = FakeHandle(instructions)
        handle.finish()
        return handle

    async def interrupt(self) -> None:
        for handle in self.handles:
            handle.interrupt()


class FakeProgress:
    def __init__(self) -> None:
        self.points: list[int] = []
        self.presented: list[list[int]] = []

    def show_point(self, point: int) -> None:
        self.points.append(point)

    def show_presented(self, presented: Sequence[int]) -> None:
        self.presented.append(list(presented))
