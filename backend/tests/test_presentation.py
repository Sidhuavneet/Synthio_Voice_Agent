import asyncio

import pytest

from synthio_backend.agent.presentation import (
    NO_POINT,
    Cursor,
    PresentationController,
    Timing,
    segments,
)
from synthio_backend.agent.prompts import BRIDGE_PHRASE, REPLAY_QUESTION
from synthio_backend.agent.slides import SlideChange, SlideController, SlideIndexError
from synthio_backend.decks.models import Deck
from synthio_backend.session.resume import ResumeState
from tests.fakes import FakeProgress, FakeSpeech

TIMING = Timing(auto_advance_s=0.01, resume_s=0.02, replay_confirm_s=0.01, turn_commit_s=0.06)
# Comfortably longer than every delay in TIMING, including the turn commit window.
WAIT_S = 0.15


async def settle() -> None:
    for _ in range(10):
        await asyncio.sleep(0)


class Rig:
    def __init__(self, deck: Deck, resume: ResumeState | None = None) -> None:
        self.deck = deck
        start = 0 if resume is None else resume.slide_index
        self.changes: list[SlideChange] = []
        self.slides = SlideController(len(deck.slides), on_change=self._record, start=start)
        self.speech = FakeSpeech()
        self.progress = FakeProgress()
        self.controller = PresentationController(
            deck, self.slides, self.speech, self.progress, resume=resume, timing=TIMING
        )

    async def _record(self, change: SlideChange) -> None:
        self.changes.append(change)

    async def finish_current(self) -> str:
        await settle()
        handle = self.speech.playing
        assert handle is not None, "nothing is playing"
        handle.finish()
        await settle()
        return handle.text

    async def finish(self, count: int) -> list[str]:
        return [await self.finish_current() for _ in range(count)]

    async def present_slide_fully(self, index: int) -> None:
        """Plays every remaining segment of the slide being presented."""
        assert self.controller.cursor.slide == index
        while self.controller.mode == "presenting":
            await self.finish_current()


@pytest.fixture
def rig(deck: Deck) -> Rig:
    return Rig(deck)


async def test_start_greets_then_narrates_points_in_order(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    spoken = await rig.finish(1 + len(segments(deck.slides[0])))
    assert spoken[1:] == [deck.slides[0].intro, *(p.narration for p in deck.slides[0].points)]
    assert "Dr. Test" in spoken[0]
    assert "interrupt" in spoken[0]
    # Greeting and intro highlight nothing, then each point in order, then nothing.
    assert rig.progress.points == [NO_POINT, NO_POINT, 0, 1, NO_POINT]
    assert rig.progress.presented == [[0]]
    assert rig.controller.mode == "idle"
    assert rig.controller.cursor == Cursor(1)


async def test_auto_advances_after_a_short_silence(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    await asyncio.sleep(WAIT_S)
    assert rig.slides.index == 1
    assert rig.controller.mode == "presenting"
    assert rig.speech.said[-1] == deck.slides[1].intro
    assert REPLAY_QUESTION not in rig.speech.said


async def test_auto_advance_waits_while_the_user_speaks(rig: Rig) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    rig.controller.on_user_speaking(True)
    await asyncio.sleep(WAIT_S)
    assert rig.slides.index == 0
    rig.controller.on_user_speaking(False)
    # Speech that never becomes a turn (noise, a false start) delays the advance only by
    # the turn commit window.
    await asyncio.sleep(WAIT_S)
    assert rig.slides.index == 1


async def test_question_in_the_gap_is_answered_before_advancing(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    rig.controller.on_user_speaking(True)
    rig.controller.on_user_speaking(False)
    # Longer than the auto-advance delay, but the turn is still being committed.
    await asyncio.sleep(0.03)
    assert rig.slides.index == 0
    assert rig.controller.mode == "idle"
    rig.controller.on_user_turn()
    rig.controller.on_agent_busy(True)  # the answer
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "answering"
    assert rig.slides.index == 0
    rig.controller.on_agent_busy(False)
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "presenting"
    assert rig.slides.index == 1
    assert rig.speech.said[-1] == deck.slides[1].intro


async def test_auto_advance_waits_while_the_agent_is_busy(rig: Rig) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    rig.controller.on_agent_busy(True)
    await asyncio.sleep(WAIT_S)
    assert rig.slides.index == 0
    rig.controller.on_agent_busy(False)
    await asyncio.sleep(WAIT_S)
    assert rig.slides.index == 1


async def test_interruption_keeps_cursor_and_resumes_from_that_point(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(3)  # greeting, intro, point 0
    await settle()
    playing = rig.speech.playing
    assert playing is not None
    assert playing.text == deck.slides[0].points[1].narration
    assert rig.controller.narrating_point == 1
    rig.controller.on_user_speaking(True)
    playing.interrupt()
    await settle()
    assert rig.controller.mode == "answering"
    assert rig.controller.narrating_point is None
    assert rig.controller.cursor == Cursor(0, 2)
    assert rig.progress.points[-1] == NO_POINT

    rig.controller.on_user_speaking(False)
    rig.controller.on_user_turn()
    rig.controller.on_agent_busy(True)  # the answer
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "answering"
    rig.controller.on_agent_busy(False)
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "presenting"
    # Same screen, so no bridge: straight back into the interrupted point.
    assert rig.speech.said[-1] == deck.slides[0].points[1].narration
    assert rig.progress.points[-1] == 1


async def test_user_turn_cancels_a_segment_that_has_not_played(rig: Rig) -> None:
    rig.controller.start()
    await rig.finish(2)  # greeting, intro
    await settle()
    queued = rig.speech.playing
    assert queued is not None
    rig.controller.on_user_turn()
    await settle()
    assert queued.interrupted
    assert rig.controller.mode == "answering"
    assert rig.controller.cursor == Cursor(0, 1)


async def test_resume_after_detour_bridges_back_to_the_cursor_slide(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(2)
    rig.controller.on_user_turn()
    await rig.controller.show(3)  # go_to_slide while answering
    assert rig.controller.cursor == Cursor(0, 1)
    assert rig.controller.resume()
    await settle()
    assert rig.speech.said[-1] == BRIDGE_PHRASE
    assert rig.slides.index == 0
    await rig.finish_current()
    assert rig.speech.said[-1] == deck.slides[0].points[0].narration


async def test_no_point_is_narrated_during_the_bridge_phrase(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(3)  # greeting, intro, point 0; point 1 is playing
    rig.controller.on_user_turn()
    await rig.controller.show(3)
    assert rig.controller.resume()
    await settle()
    assert rig.speech.said[-1] == BRIDGE_PHRASE
    assert rig.controller.cursor == Cursor(0, 2)
    # The cursor still points at point 1, but the bridge is what is playing.
    assert rig.controller.narrating_point is None
    await rig.finish_current()
    assert rig.speech.said[-1] == deck.slides[0].points[1].narration
    assert rig.controller.narrating_point == 1


async def test_slide_changes_record_their_trigger(rig: Rig) -> None:
    rig.controller.start()
    await rig.finish(1)  # greeting
    assert rig.controller.narrating_point is None  # the intro is not a point
    await rig.present_slide_fully(0)
    await asyncio.sleep(WAIT_S)  # auto-advance to slide 1
    rig.controller.on_user_turn()
    await rig.controller.show(3, reason="return to play")
    assert rig.controller.resume()
    await settle()
    await rig.controller.navigate(4)
    await settle()
    assert [(c.from_index, c.to_index, c.trigger, c.reason) for c in rig.changes] == [
        (0, 1, "auto", None),
        (1, 3, "question", "return to play"),
        (3, 1, "resume", None),
        (1, 4, "user", None),
    ]


async def test_navigate_to_new_slide_presents_it_at_once(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.controller.navigate(3)
    await settle()
    assert rig.slides.index == 3
    assert rig.controller.cursor == Cursor(3, 0)
    assert rig.speech.said[-1] == deck.slides[3].intro
    # The interrupted greeting/intro handles were stopped.
    assert all(h.done for h in rig.speech.handles[:-1])


async def test_navigate_to_presented_slide_asks_then_replays(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    await asyncio.sleep(WAIT_S)  # auto-advance into slide 1
    await rig.controller.navigate(0)
    assert rig.slides.index == 0
    assert await rig.finish_current() == REPLAY_QUESTION
    assert rig.controller.mode == "idle"
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "presenting"
    assert rig.speech.said[-1] == deck.slides[0].intro
    await rig.present_slide_fully(0)
    # After the replay the presentation carries on at the first slide not yet presented.
    assert rig.controller.cursor == Cursor(1)


async def test_declined_replay_returns_to_the_cursor(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    await asyncio.sleep(WAIT_S)
    await rig.finish(2)  # slide 1: intro, point 0
    await rig.controller.navigate(0)
    await rig.finish_current()  # replay question
    rig.controller.on_user_speaking(True)  # "no thanks"
    rig.controller.on_user_speaking(False)
    rig.controller.on_user_turn()
    rig.controller.on_agent_busy(True)  # the reply
    rig.controller.on_agent_busy(False)
    await asyncio.sleep(WAIT_S)
    assert rig.speech.said[-1] == BRIDGE_PHRASE
    await rig.finish_current()
    assert rig.slides.index == 1
    assert rig.speech.said[-1] == deck.slides[1].points[1].narration


async def test_navigate_rejects_bad_index(rig: Rig) -> None:
    with pytest.raises(SlideIndexError):
        await rig.controller.navigate(42)


async def test_last_slide_ends_with_one_wrap_up(deck: Deck) -> None:
    last = len(deck.slides) - 1
    rig = Rig(deck, ResumeState(slide_index=last, presented=list(range(last))))
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(last)
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "finished"
    assert len(rig.speech.replies) == 1
    assert deck.title in rig.speech.replies[0]
    # Questions after the end are answered without auto-resuming.
    rig.controller.on_user_turn()
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "finished"
    assert not rig.controller.resume()
    # An explicit request still presents, without a second wrap-up.
    rig.controller.present(0)
    await rig.present_slide_fully(0)
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "finished"
    assert len(rig.speech.replies) == 1


async def test_resume_state_welcomes_back_and_skips_presented(deck: Deck) -> None:
    rig = Rig(deck, ResumeState(slide_index=1, presented=[0, 2]))
    rig.controller.start()
    greeting = await rig.finish_current()
    assert greeting.startswith("Welcome back")
    assert deck.slides[1].title in greeting
    await rig.present_slide_fully(1)
    assert rig.progress.presented[-1] == [0, 1, 2]
    assert rig.controller.cursor == Cursor(3)


async def test_session_not_running_stops_quietly(rig: Rig) -> None:
    rig.speech.fail = True
    rig.controller.start()
    await settle()
    assert rig.controller.mode == "idle"


async def test_unexpected_failure_does_not_stall_in_presenting(deck: Deck) -> None:
    async def broken_room(_: SlideChange) -> None:
        raise ConnectionError("room closed")

    speech = FakeSpeech()
    controller = PresentationController(
        deck,
        SlideController(len(deck.slides), on_change=broken_room),
        speech,
        FakeProgress(),
        timing=TIMING,
    )
    controller.present(2)
    await settle()
    assert controller.mode == "idle"
    assert speech.handles == []


async def test_close_cancels_presenting_and_timers(rig: Rig) -> None:
    rig.controller.start()
    await settle()
    rig.controller.close()
    await asyncio.sleep(WAIT_S)
    assert all(h.done for h in rig.speech.handles)
    assert len(rig.speech.handles) == 1


async def test_user_turn_resumes_even_if_the_reply_never_starts(rig: Rig, deck: Deck) -> None:
    rig.controller.start()
    await rig.finish(3)  # greeting, intro, point 0
    rig.controller.on_user_turn()
    # The reply fails before the agent gets busy: the presentation must not stall.
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "presenting"
    assert rig.speech.said[-1] == deck.slides[0].points[1].narration


async def test_user_turn_timer_is_cancelled_while_the_reply_runs(rig: Rig) -> None:
    rig.controller.start()
    await rig.finish(3)
    rig.controller.on_user_turn()
    rig.controller.on_agent_busy(True)
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "answering"


async def test_state_reports_screen_cursor_and_replay_offer(rig: Rig) -> None:
    rig.controller.start()
    await rig.finish(1)
    await rig.present_slide_fully(0)
    await asyncio.sleep(WAIT_S)
    await rig.finish(2)  # slide 1: intro, point 0
    await rig.controller.navigate(0)
    await rig.finish_current()  # replay question
    state = rig.controller.state()
    assert (state.mode, state.screen, state.cursor, state.replay_offer) == (
        "idle",
        0,
        Cursor(1, 2),
        0,
    )
    # The offer outlives the user's answer, so the LLM can act on a "yes".
    rig.controller.on_user_turn()
    assert rig.controller.state().replay_offer == 0
    rig.controller.present(0)
    assert rig.controller.state().replay_offer is None
    rig.controller.close()


async def test_slides_jumped_over_stay_skipped(rig: Rig, deck: Deck) -> None:
    last = len(deck.slides) - 1
    rig.controller.present(last - 1)
    await rig.present_slide_fully(last - 1)
    assert rig.controller.cursor == Cursor(last)
    await asyncio.sleep(WAIT_S)
    await rig.present_slide_fully(last)
    await asyncio.sleep(WAIT_S)
    assert rig.controller.mode == "finished"
    assert rig.controller.presented == [last - 1, last]
