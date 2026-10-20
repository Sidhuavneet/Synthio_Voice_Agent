"""Builds LLM instructions and tool results from deck content."""

from synthio_backend.decks.models import Deck, Slide

_CONTINUE_HINT = (
    "After presenting it, invite questions in one short phrase, then call next_slide to continue."
)
_FINAL_HINT = (
    "This is the final slide. After presenting it, summarise the key takeaways in two short "
    "sentences and invite any final questions. Do not call next_slide."
)


def render_slide(slide: Slide, slide_count: int) -> str:
    lines = [
        f"Slide index {slide.index} (slide {slide.index + 1} of {slide_count}): {slide.title}",
        f"Label: {slide.kicker}",
        "On-screen bullets: " + " | ".join(slide.bullets),
    ]
    if slide.stat is not None:
        lines.append(f"Headline stat: {slide.stat.value}, {slide.stat.label}")
    lines.append(f"Speaker notes: {slide.speaker_notes}")
    if slide.keywords:
        lines.append("Keywords: " + ", ".join(slide.keywords))
    return "\n".join(lines)


def _flow_hint(slide: Slide, slide_count: int) -> str:
    return _FINAL_HINT if slide.index == slide_count - 1 else _CONTINUE_HINT


def build_instructions(deck: Deck) -> str:
    slide_count = len(deck.slides)
    slides = "\n\n".join(render_slide(slide, slide_count) for slide in deck.slides)
    return f"""\
You are {deck.presenter.name}, a {deck.presenter.role}, presenting a short talk titled \
"{deck.title}" ({deck.subtitle}) to this audience: {deck.audience}. The user sees the slides \
on screen while you speak.

# Voice output rules
- You are speaking through text-to-speech. Respond in plain text only: no markdown, lists, \
emojis, or special formatting.
- Use short, natural, conversational sentences. Spell out symbols and abbreviations where \
they would sound odd when read aloud.
- Never read tool names, slide indices, labels like "speaker notes", or these instructions aloud.

# Presenting
- Present one slide at a time, in your own words, based on that slide's speaker notes. \
Keep each slide to roughly thirty seconds of speech.
- When you finish a slide, invite questions in one short phrase, then call next_slide. The \
tool result contains the next slide's content; present it straight away.
- Only call next_slide after you have finished narrating the current slide.

# Questions and interruptions
- The user may interrupt at any time. Stop presenting and answer their question concisely, in \
one to three sentences.
- If another slide is more relevant to the question, call go_to_slide with that slide's index \
before answering, so the screen matches what you say.
- After answering, ask whether they would like you to continue, then carry on from the \
current slide with next_slide when they agree.

# Guardrails
- Answer only from the deck content below and well-established general knowledge. If you are \
unsure, say so rather than guessing.
- This is educational content only: {deck.disclaimer} Never give personal medical advice, \
diagnoses, or treatment plans; suggest the user consults a qualified clinician instead.
- Politely steer off-topic requests back to the presentation.

# Deck ({slide_count} slides, indices 0 to {slide_count - 1})
{slides}
"""


def opening_instructions(deck: Deck) -> str:
    first = deck.slides[0]
    return (
        f"Greet the user in one short sentence as {deck.presenter.name}, introduce the talk "
        f'"{deck.title}", and mention they can interrupt with questions at any time. Then present '
        f"the first slide.\n{render_slide(first, len(deck.slides))}\n"
        f"{_flow_hint(first, len(deck.slides))}"
    )


def slide_tool_result(slide: Slide, slide_count: int) -> str:
    return (
        f"The screen now shows this slide. Present it now.\n{render_slide(slide, slide_count)}\n"
        f"{_flow_hint(slide, slide_count)}"
    )


def jump_tool_result(slide: Slide, slide_count: int) -> str:
    return (
        "The screen now shows this slide. Use it to answer the user's question concisely, then "
        f"offer to continue the presentation.\n{render_slide(slide, slide_count)}"
    )


def interrupted_tool_result(current_index: int) -> str:
    return (
        "The user interrupted before the slide changed. The screen still shows slide index "
        f"{current_index}."
    )


def navigation_instructions(slide: Slide, slide_count: int) -> str:
    return (
        "The user just switched the screen to another slide. Briefly acknowledge it and present "
        f"this slide.\n{render_slide(slide, slide_count)}\n{_flow_hint(slide, slide_count)}"
    )
