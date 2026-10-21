"""Per-reply note telling the LLM where the presentation stands.

Presenting is scripted, so the chat history holds no reliable record of the slide on screen,
the presentation cursor or a pending replay question. The presenter adds this note to the
LLM's context for every reply, so "this slide", "next slide", "yes" and "no" resolve to the
right slide.
"""

from synthio_backend.agent.presentation import PresentationState
from synthio_backend.decks.models import Deck, Slide


def _name(slide: Slide) -> str:
    return f'slide index {slide.index}, "{slide.title}"'


def _resume_line(deck: Deck, state: PresentationState) -> str:
    if state.mode == "finished":
        return "- The presentation has finished."
    if state.cursor.slide >= len(deck.slides):
        return "- Every slide has been presented."
    slide = deck.slides[state.cursor.slide]
    segment = state.cursor.segment
    where = "its start" if segment == 0 else f"point {segment} of {len(slide.points)}"
    return f"- The presentation will resume at {_name(slide)}, from {where}."


def turn_context_note(deck: Deck, state: PresentationState) -> str:
    screen = deck.slides[state.screen]
    following = state.screen + 1
    lines = [
        "Presentation state for this reply. Never read it aloud.",
        f"- On screen: {_name(screen)}.",
        f"- Next slide after it: {_name(deck.slides[following])}."
        if following < len(deck.slides)
        else "- The slide on screen is the last slide.",
        _resume_line(deck, state),
    ]
    if state.replay_offer is not None:
        offer = state.replay_offer
        lines.append(
            f"- You just asked whether to go through {_name(deck.slides[offer])} again. If the "
            f"user agrees, call present_slide with index {offer}. If they decline, call "
            "resume_presentation."
        )
    return "\n".join(lines)
