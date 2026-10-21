import pytest

from synthio_backend.agent.events import ComplianceCategory
from synthio_backend.agent.prompts import (
    build_instructions,
    compliance_tool_result,
    jump_tool_result,
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


def test_instructions_cover_compliance_categories(deck: Deck) -> None:
    instructions = build_instructions(deck)
    assert "call flag_compliance first" in instructions
    for category in ("off_label", "personal_medical_advice", "adverse_event", "out_of_scope"):
        assert f"- {category}:" in instructions


def test_jump_result_asks_for_short_answer_not_narration(deck: Deck) -> None:
    result = jump_tool_result(deck.slides[3], len(deck.slides))
    assert "Do not present it" in result
    assert "one to three sentences" in result
    assert deck.slides[3].title in result


@pytest.mark.parametrize(
    "category", ["off_label", "personal_medical_advice", "adverse_event", "out_of_scope"]
)
def test_compliance_result_offers_to_continue(category: ComplianceCategory) -> None:
    assert "offer to continue the presentation" in compliance_tool_result(category)
