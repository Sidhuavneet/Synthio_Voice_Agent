from synthio_backend.agent.presentation import Cursor, PresentationState
from synthio_backend.agent.turn_context import turn_context_note
from synthio_backend.decks.models import Deck


def test_note_names_screen_next_slide_and_cursor_point(deck: Deck) -> None:
    note = turn_context_note(
        deck, PresentationState(mode="answering", screen=3, cursor=Cursor(1, 2), replay_offer=None)
    )
    assert f'On screen: slide index 3, "{deck.slides[3].title}"' in note
    assert f'Next slide after it: slide index 4, "{deck.slides[4].title}"' in note
    points = len(deck.slides[1].points)
    assert f'resume at slide index 1, "{deck.slides[1].title}", from point 2 of {points}' in note
    assert "again" not in note


def test_note_on_last_slide_at_a_slide_start(deck: Deck) -> None:
    last = len(deck.slides) - 1
    note = turn_context_note(
        deck, PresentationState(mode="idle", screen=last, cursor=Cursor(last), replay_offer=None)
    )
    assert "is the last slide" in note
    assert "from its start" in note


def test_note_tells_how_to_answer_a_replay_offer(deck: Deck) -> None:
    note = turn_context_note(
        deck, PresentationState(mode="answering", screen=0, cursor=Cursor(2, 1), replay_offer=0)
    )
    assert f'go through slide index 0, "{deck.slides[0].title}" again' in note
    assert "call present_slide with index 0" in note
    assert "call resume_presentation" in note


def test_note_when_done(deck: Deck) -> None:
    count = len(deck.slides)
    done = PresentationState(mode="idle", screen=0, cursor=Cursor(count), replay_offer=None)
    finished = PresentationState(mode="finished", screen=0, cursor=Cursor(0), replay_offer=None)
    assert "Every slide has been presented" in turn_context_note(deck, done)
    assert "The presentation has finished" in turn_context_note(deck, finished)
