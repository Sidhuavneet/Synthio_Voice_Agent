import pytest

from synthio_backend.agent.events import ComplianceCategory
from synthio_backend.agent.prompts import (
    build_instructions,
    compliance_tool_result,
    greeting,
    jump_tool_result,
    render_slide,
    wrap_up_instructions,
)
from synthio_backend.decks.models import Deck


def test_instructions_include_every_slide(deck: Deck) -> None:
    instructions = build_instructions(deck)
    assert "Dr. Test" in instructions
    assert deck.disclaimer in instructions
    for slide in deck.slides:
        assert f"Slide index {slide.index} " in instructions
        assert slide.intro in instructions
        for point in slide.points:
            assert point.narration in instructions
        for keyword in slide.keywords:
            assert keyword in instructions


def test_render_slide_lists_points_in_order_and_stat(deck: Deck) -> None:
    with_stat = render_slide(deck.slides[0], len(deck.slides))
    without_stat = render_slide(deck.slides[1], len(deck.slides))
    assert "Headline stat: 10%" in with_stat
    assert "Headline stat" not in without_stat
    assert "slide 2 of 5" in without_stat
    first, second = (p.text for p in deck.slides[0].points)
    assert with_stat.index(f"1. {first}") < with_stat.index(f"2. {second}")


def test_instructions_are_for_questions_only(deck: Deck) -> None:
    instructions = build_instructions(deck)
    assert "never narrate a slide" in instructions
    assert "Never ask whether to continue" in instructions
    for tool in ("go_to_slide", "present_slide", "resume_presentation"):
        assert tool in instructions
    assert "presentation state note" in instructions
    assert "move on, skip ahead or go to the next slide, call present_slide" in instructions
    assert "continue, carry on or go on" in instructions


def test_instructions_have_two_compliance_tiers(deck: Deck) -> None:
    instructions = build_instructions(deck)
    assert "Tier one, answer with a caveat and do not flag" in instructions
    assert "how long until I can play again?" in instructions
    assert "Call flag_compliance first" in instructions
    for category in ("off_label", "personal_medical_advice", "adverse_event", "out_of_scope"):
        assert f"- {category}:" in instructions


def test_greeting_mentions_interrupting(deck: Deck) -> None:
    text = greeting(deck, None)
    assert text.startswith("Hi, I'm Dr. Test")
    assert deck.title in text
    assert "interrupt" in text


def test_greeting_welcomes_back(deck: Deck) -> None:
    assert greeting(deck, 2) == f"Welcome back. Let's pick up at {deck.slides[2].title}."


def test_wrap_up_names_the_talk(deck: Deck) -> None:
    assert deck.title in wrap_up_instructions(deck)


def test_jump_result_asks_for_short_answer_not_narration(deck: Deck) -> None:
    result = jump_tool_result(deck.slides[3], len(deck.slides))
    assert "Do not present it" in result
    assert "one to three sentences" in result
    assert deck.slides[3].title in result
    assert "continue" not in result


@pytest.mark.parametrize(
    "category", ["off_label", "personal_medical_advice", "adverse_event", "out_of_scope"]
)
def test_compliance_result_is_short_and_does_not_ask_to_continue(
    category: ComplianceCategory,
) -> None:
    result = compliance_tool_result(category)
    assert "one or two sentences" in result
    assert "continue" not in result
