"""Builds LLM instructions and tool results from deck content."""

from synthio_backend.agent.events import ComplianceCategory
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
- Narrate a whole slide only when presenting it: after next_slide, or when the user switches \
the screen themselves.

# Questions and interruptions
- The user may interrupt at any time. Stop presenting and answer their question.
- If another slide is more relevant to the question, call go_to_slide with that slide's index \
before answering, so the screen matches what you say.
- Answer in one to three sentences, grounded in the relevant slide. Do not narrate the slide \
or repeat its speaker notes, even right after go_to_slide.
- Then ask whether they would like you to continue, and carry on from the current slide with \
next_slide when they agree.

# Compliance
- Answer only from the deck content below and well-established general knowledge consistent \
with it. If you are unsure, say so rather than guessing.
- This is educational content only: {deck.disclaimer}
- Never give personal medical advice, dosing for an individual, or off-label claims.
- If the user's message falls into one of these categories, call flag_compliance first, then \
follow the tool result to deflect compliantly and offer to continue the presentation:
  - off_label: using a medicine, product or treatment outside its approved use, dose or \
population, or claims the deck does not support.
  - personal_medical_advice: what the user or a specific person should do about their own \
symptoms, injury, diagnosis, treatment or medication dose.
  - adverse_event: the user reports a side effect, reaction or harm that they or someone \
else experienced after a medicine, product or treatment.
  - out_of_scope: requests unrelated to the topic of this talk.
- General educational questions about the deck topic are not compliance issues; answer them \
normally.

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
        "The screen now shows this slide. Do not present it. Answer the user's question in one "
        "to three sentences using only the relevant detail below, then ask whether they would "
        f"like you to continue.\n{render_slide(slide, slide_count)}"
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


_COMPLIANCE_DEFLECTIONS: dict[ComplianceCategory, str] = {
    "off_label": (
        "Say you can only discuss uses supported by this presentation and approved guidance, "
        "so you cannot recommend or comment on that use, and suggest they ask their clinician."
    ),
    "personal_medical_advice": (
        "Say you cannot give personal medical advice and that a qualified clinician who can "
        "assess them is the right person to ask. Do not apply deck content to their situation."
    ),
    "adverse_event": (
        "Thank them for sharing it. Do not assess whether the treatment caused it. Advise them "
        "to contact their doctor, and to report it through the medicines regulator's or the "
        "manufacturer's reporting line."
    ),
    "out_of_scope": "Politely say that is outside the topic of this talk.",
}


def compliance_tool_result(category: ComplianceCategory) -> str:
    return (
        f"Flag recorded. {_COMPLIANCE_DEFLECTIONS[category]} Keep it to one or two sentences, "
        "then offer to continue the presentation."
    )
