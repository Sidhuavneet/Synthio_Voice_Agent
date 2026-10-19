from synthio_backend.agent.prompts import (
    build_instructions,
    opening_instructions,
    render_slide,
    slide_tool_result,
)
from synthio_backend.decks.models import Deck


def test_instructions_include_every_slide(deck: Deck) -> None:
    instructions = build_instructions(deck)
    assert "Dr. Test" in instructions
    assert deck.disclaimer in instructions
    for slide in deck.slides:
        assert f"Slide index {slide.index} " in instructions
        assert slide.speaker_notes in instructions
        for keyword in slide.keywords:
            assert keyword in instructions


def test_render_slide_includes_stat_when_present(deck: Deck) -> None:
    with_stat = render_slide(deck.slides[0], len(deck.slides))
    without_stat = render_slide(deck.slides[1], len(deck.slides))
    assert "Headline stat: 10%" in with_stat
    assert "Headline stat" not in without_stat
    assert "slide 2 of 5" in without_stat


def test_flow_hints(deck: Deck) -> None:
    count = len(deck.slides)
    assert "call next_slide" in opening_instructions(deck)
    assert "call next_slide to continue" in slide_tool_result(deck.slides[2], count)
    final = slide_tool_result(deck.slides[-1], count)
    assert "final slide" in final
    assert "Do not call next_slide" in final
