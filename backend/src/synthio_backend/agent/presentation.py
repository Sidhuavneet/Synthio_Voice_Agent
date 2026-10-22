"""Code-driven, scripted presentation of a deck (see docs/CONTRACT.md section 6).

The controller owns the presentation cursor (slide, segment), the set of fully presented
slides, the mode, and the timers that advance and resume the talk. It talks to the outside
world only through the small ``Speech`` and ``ProgressSink`` protocols, so it is unit-tested
with fakes and wired to LiveKit by adapters.

Each slide is spoken as segments: segment 0 is the intro, segment ``k`` is ``points[k - 1]``.
Segments are scheduled one at a time, each after the previous one has played out, and
``slide.point`` is published right before a segment is scheduled. Scheduling one at a time
keeps nothing queued behind an interruption (a queued segment would otherwise play after the
answer), and the highlight leads the audio only by the TTS time-to-first-byte.
"""

import asyncio
import logging
from collections.abc import Callable, Coroutine, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from synthio_backend.agent.prompts import (
    BRIDGE_PHRASE,
    REPLAY_QUESTION,
    greeting,
    wrap_up_instructions,
)
from synthio_backend.agent.slides import SlideController, SlideTrigger
from synthio_backend.decks.models import Deck, Slide
from synthio_backend.session.resume import ResumeState

logger = logging.getLogger(__name__)

AUTO_ADVANCE_DELAY_S = 1.0
"""Silence after a finished slide before the next one starts."""
RESUME_DELAY_S = 2.5
"""Silence after an answer before the presentation resumes from the cursor."""
REPLAY_CONFIRM_DELAY_S = 1.0
"""Silence after the replay question before an already presented slide is replayed."""
MAX_ENDPOINTING_DELAY_S = 3.0
"""Longest wait after user speech before LiveKit commits it as a turn (the session's
``endpointing.max_delay``). Timers wait this much longer after speech that has not become a
turn yet, so the talk never restarts over a question still being committed, while noise that
never becomes a turn still lets it carry on."""
LISTEN_HOLD_S = 8.0
"""How long the talk waits for the user after they asked to speak (``agent.interrupt``, the
frontend's tap to speak) before resuming, if no speech has arrived."""

NO_POINT = -1

Mode = Literal["presenting", "answering", "idle", "finished"]


class Playback(Protocol):
    """One scheduled utterance (implemented by LiveKit's ``SpeechHandle``)."""

    @property
    def interrupted(self) -> bool: ...

    def interrupt(self, *, force: bool = False) -> object: ...

    async def wait_for_playout(self) -> None: ...


class Speech(Protocol):
    def say(self, text: str) -> Playback: ...

    def generate_reply(self, instructions: str) -> Playback: ...

    async def interrupt(self) -> None:
        """Stops whatever the agent is saying."""


class ProgressSink(Protocol):
    """Publishes progress to the frontend; calls must not block."""

    def show_point(self, point: int) -> None: ...

    def show_presented(self, presented: Sequence[int]) -> None: ...

    def show_mode(self, mode: Mode) -> None: ...


@dataclass(frozen=True, slots=True)
class Timing:
    auto_advance_s: float = AUTO_ADVANCE_DELAY_S
    resume_s: float = RESUME_DELAY_S
    replay_confirm_s: float = REPLAY_CONFIRM_DELAY_S
    turn_commit_s: float = MAX_ENDPOINTING_DELAY_S
    listen_hold_s: float = LISTEN_HOLD_S


@dataclass(frozen=True, slots=True)
class Cursor:
    slide: int
    """Slide to present; equal to the slide count once the deck is done."""
    segment: int = 0
    """0 is the intro, k is points[k - 1]."""


@dataclass(frozen=True, slots=True)
class PresentationState:
    """What the LLM needs to know to answer a turn (see ``turn_context_note``)."""

    mode: Mode
    screen: int
    """Slide on screen."""
    cursor: Cursor
    replay_offer: int | None
    """Slide the user was last asked whether to hear again, until presenting restarts."""


def segments(slide: Slide) -> list[str]:
    return [slide.intro, *(point.narration for point in slide.points)]


class PresentationController:
    def __init__(
        self,
        deck: Deck,
        slides: SlideController,
        speech: Speech,
        progress: ProgressSink,
        *,
        resume: ResumeState | None = None,
        timing: Timing | None = None,
    ) -> None:
        self._deck = deck
        self._slides = slides
        self._speech = speech
        self._progress = progress
        self._timing = timing or Timing()
        self._resume_slide = None if resume is None else resume.slide_index
        self._cursor = Cursor(0 if resume is None else resume.slide_index)
        self._presented: set[int] = set() if resume is None else set(resume.presented)
        self._mode: Mode = "idle"
        self._advance_pending = False
        # Slide whose replay runs when the confirm timer fires; cleared by any user turn.
        self._replay_pending: int | None = None
        # Slide the replay question was about; kept through the user's answer so the LLM
        # can act on a "yes" or "no".
        self._replay_offer: int | None = None
        self._wrapped_up = False
        # False once the screen was moved away from the presentation (Q&A or a declined
        # replay), so resuming switches back with a bridge phrase.
        self._screen_follows_cursor = True
        self._user_speaking = False
        # Loop time until which ended user speech may still be committed as a turn.
        self._turn_pending_until: float | None = None
        self._agent_busy = False
        self._presenting_task: asyncio.Task[None] | None = None
        self._current: Playback | None = None
        # Point of the segment playing now; None for an intro or a lead phrase, or when idle.
        self._playing_point: int | None = None
        self._timer: asyncio.Task[None] | None = None
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def mode(self) -> Mode:
        return self._mode

    @property
    def cursor(self) -> Cursor:
        return self._cursor

    @property
    def presented(self) -> list[int]:
        return sorted(self._presented)

    @property
    def narrating_point(self) -> int | None:
        """Point being narrated right now, or None (intro, lead phrase, Q&A, idle)."""
        return self._playing_point if self._mode == "presenting" else None

    def state(self) -> PresentationState:
        return PresentationState(
            mode=self._mode,
            screen=self._slides.index,
            cursor=self._cursor,
            replay_offer=self._replay_offer,
        )

    # -- commands ---------------------------------------------------------------------------

    def start(self) -> None:
        """Greets the user, then presents from the cursor."""
        self._begin(lead=greeting(self._deck, self._resume_slide), trigger="auto")

    async def navigate(self, index: int) -> None:
        """The user picked a slide: present it, or offer to replay one already presented."""
        self._slides.validate(index)
        self._clear_pending()
        self._stop_presenting()
        await self._speech.interrupt()
        if index not in self._presented:
            self._cursor = Cursor(index)
            self._begin(lead=None, trigger="user")
            return
        await self.show(index, trigger="user")
        self._set_mode("idle")
        self._replay_pending = index
        self._replay_offer = index
        self._spawn(self._ask_replay())

    async def interrupt_for_user(self) -> None:
        """The user asked to speak: stops the agent and holds the talk for ``listen_hold_s``.

        The cursor keeps its place, as for a spoken barge-in; the hold rides on the turn
        commit wait, so user speech or a committed turn take over from it as usual.
        """
        hold_until = asyncio.get_running_loop().time() + self._timing.listen_hold_s
        self._turn_pending_until = max(self._turn_pending_until or 0.0, hold_until)
        self._reschedule()
        await self._speech.interrupt()

    def present(self, index: int) -> None:
        """Moves the cursor to ``index`` and presents it from its first segment."""
        self._slides.validate(index)
        self._clear_pending()
        self._cursor = Cursor(index)
        self._begin(lead=None, trigger="user")

    def resume(self) -> bool:
        """Continues from the cursor. Returns False once the presentation has finished."""
        if self._mode == "finished":
            return False
        self._clear_pending()
        if self._cursor.slide >= len(self._deck.slides):
            self._finish()
            return True
        returning = self._slides.index != self._cursor.slide and not self._screen_follows_cursor
        if returning:
            self._begin(lead=BRIDGE_PHRASE, trigger="resume")
        else:
            self._begin(lead=None, trigger="auto")
        return True

    async def show(
        self, index: int, trigger: SlideTrigger = "question", reason: str | None = None
    ) -> None:
        """Shows a slide without moving the cursor (to answer a question)."""
        await self._slides.go_to(index, trigger, reason)
        self._screen_follows_cursor = index == self._cursor.slide

    def close(self) -> None:
        self._cancel_timer()
        self._stop_presenting()
        for task in list(self._tasks):
            task.cancel()

    # -- session signals --------------------------------------------------------------------

    def on_user_turn(self) -> None:
        """The user finished a turn and the LLM is about to answer it."""
        self._turn_pending_until = None
        self._clear_pending()
        self._stop_presenting()
        if self._mode != "finished":
            self._set_mode("answering")
        # Arms the resume timer in case the reply fails before the agent gets busy (which
        # cancels it); the agent going quiet after the reply re-arms it.
        self._reschedule()

    def on_user_speaking(self, speaking: bool) -> None:
        if self._user_speaking and not speaking:
            loop = asyncio.get_running_loop()
            self._turn_pending_until = loop.time() + self._timing.turn_commit_s
        self._user_speaking = speaking
        self._reschedule()

    def on_agent_busy(self, busy: bool) -> None:
        """``busy`` while the agent is thinking or speaking."""
        self._agent_busy = busy
        self._reschedule()

    # -- presenting -------------------------------------------------------------------------

    def _begin(self, lead: str | None, trigger: SlideTrigger) -> None:
        self._cancel_timer()
        self._stop_presenting()
        self._replay_offer = None
        self._set_mode("presenting")
        self._presenting_task = asyncio.create_task(self._present(lead, trigger))

    async def _present(self, lead: str | None, trigger: SlideTrigger) -> None:
        start = self._cursor
        slide = self._deck.slides[start.slide]
        try:
            await self._slides.go_to(slide.index, trigger)
            self._screen_follows_cursor = True
            if lead is not None and not await self._play(lead, NO_POINT):
                return
            script = segments(slide)
            for segment in range(start.segment, len(script)):
                self._cursor = Cursor(slide.index, segment)
                if not await self._play(script[segment], segment - 1):
                    return
        # The session is closing (say() raises RuntimeError once it is not running).
        except RuntimeError:
            logger.warning("presentation stopped: session is not running", exc_info=True)
            self._stop_after_failure()
            return
        except Exception:
            logger.exception("presentation stopped by an unexpected error")
            self._stop_after_failure()
            return
        self._progress.show_point(NO_POINT)
        self._presented.add(slide.index)
        self._progress.show_presented(self.presented)
        self._cursor = Cursor(self._next_slide_after(slide.index))
        self._set_mode("idle")
        self._advance_pending = True
        logger.info("presented slide %d", slide.index)
        self._reschedule()

    async def _play(self, text: str, point: int) -> bool:
        """Speaks one segment; returns False when it was interrupted."""
        self._progress.show_point(point)
        handle = self._speech.say(text)
        self._current = handle
        self._playing_point = None if point == NO_POINT else point
        try:
            await handle.wait_for_playout()
        finally:
            self._current = None
            self._playing_point = None
        if not handle.interrupted:
            return True
        # Interrupted by the user (an explicit stop cancels this task instead).
        logger.info("presentation interrupted at %s", self._cursor)
        self._progress.show_point(NO_POINT)
        self._set_mode("answering")
        self._reschedule()
        return False

    def _set_mode(self, mode: Mode) -> None:
        if mode != self._mode:
            self._mode = mode
            self._progress.show_mode(mode)

    def _stop_after_failure(self) -> None:
        """Leaves ``presenting`` so a failed segment cannot stall the controller; the next
        user turn answers and resumes from the cursor as usual."""
        self._current = None
        self._progress.show_point(NO_POINT)
        self._set_mode("idle")

    def _stop_presenting(self) -> None:
        task, self._presenting_task = self._presenting_task, None
        if task is None or task.done():
            return
        task.cancel()
        if self._current is not None:
            self._current.interrupt(force=True)
            self._current = None
        self._progress.show_point(NO_POINT)

    def _next_slide_after(self, index: int) -> int:
        """The next slide after ``index`` not yet presented, or the slide count when none is
        left. Slides before ``index`` that the user jumped over stay skipped: the user chose
        to leave them, and can still pick them from the slide rail."""
        count = len(self._deck.slides)
        return next((i for i in range(index + 1, count) if i not in self._presented), count)

    def _finish(self) -> None:
        if self._wrapped_up:
            self._set_mode("finished")
            return
        self._wrapped_up = True
        # Published once the wrap-up has played out: to the frontend, "finished" means the
        # talk is over.
        self._mode = "finished"
        try:
            handle = self._speech.generate_reply(wrap_up_instructions(self._deck))
        except RuntimeError:
            logger.warning("wrap-up skipped: session is not running", exc_info=True)
            self._progress.show_mode("finished")
            return
        self._spawn(self._announce_finished(handle))

    async def _announce_finished(self, wrap_up: Playback) -> None:
        await wrap_up.wait_for_playout()
        if self._mode == "finished":
            self._progress.show_mode("finished")

    async def _ask_replay(self) -> None:
        try:
            handle = self._speech.say(REPLAY_QUESTION)
            await handle.wait_for_playout()
        except RuntimeError:
            logger.warning("replay question skipped: session is not running", exc_info=True)
            return
        if not handle.interrupted:
            self._reschedule()

    def _replay(self) -> None:
        index = self._replay_pending
        if index is not None:
            self.present(index)

    # -- timers -----------------------------------------------------------------------------

    def _reschedule(self) -> None:
        """(Re)starts the timer that fits the current state, if the room is quiet."""
        self._cancel_timer()
        if self._user_speaking or self._agent_busy:
            return
        if self._mode == "answering":
            self._start_timer(self._timing.resume_s, self.resume)
        elif self._mode == "idle" and self._replay_pending is not None:
            self._start_timer(self._timing.replay_confirm_s, self._replay)
        elif self._mode == "idle" and self._advance_pending:
            self._start_timer(self._timing.auto_advance_s, self.resume)

    def _turn_commit_wait(self) -> float:
        """Time left in which ended user speech may still become a turn."""
        if self._turn_pending_until is None:
            return 0.0
        left = self._turn_pending_until - asyncio.get_running_loop().time()
        if left <= 0:
            self._turn_pending_until = None
            return 0.0
        return left

    def _start_timer(self, delay_s: float, action: Callable[[], object]) -> None:
        delay_s += self._turn_commit_wait()

        async def fire() -> None:
            await asyncio.sleep(delay_s)
            self._timer = None
            action()

        self._timer = asyncio.create_task(fire())

    def _cancel_timer(self) -> None:
        timer, self._timer = self._timer, None
        if timer is not None:
            timer.cancel()

    def _clear_pending(self) -> None:
        self._cancel_timer()
        self._advance_pending = False
        self._replay_pending = None

    def _spawn(self, coro: Coroutine[Any, Any, None]) -> None:
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
