"""Scripted lines, LLM instructions and tool results built from deck content.

Presenting is scripted (see docs/CONTRACT.md section 6): the LLM only answers questions, so
its instructions describe the deck as reference material, not as something to narrate.
"""

from synthio_backend.agent.events import ComplianceCategory
from synthio_backend.decks.models import Deck, Slide

BRIDGE_PHRASE = "Right, back to where we were."
REPLAY_QUESTION = "We've covered this one. Shall I go through it again?"


def greeting(deck: Deck, resume_slide: int | None) -> str:
    """Scripted opening line, spoken before the first slide."""
    if resume_slide is not None:
        return f"Welcome back. Let's pick up at {deck.slides[resume_slide].title}."
    return (
        f"Hi, I'm {deck.presenter.name}. Today's talk is {deck.title}. "
        "Feel free to interrupt me any time with a question."
    )


def render_slide(slide: Slide, slide_count: int) -> str:
    lines = [
        f"Slide index {slide.index} (slide {slide.index + 1} of {slide_count}): {slide.title}",
        f"Label: {slide.kicker}",
        f"Intro: {slide.intro}",
        "Points, in on-screen order:",
        *(f"{i}. {p.text}. {p.detail} {p.narration}" for i, p in enumerate(slide.points, 1)),
    ]
    if slide.stat is not None:
        lines.append(f"Headline stat: {slide.stat.value}, {slide.stat.label}")
    if slide.keywords:
        lines.append("Keywords: " + ", ".join(slide.keywords))
    return "\n".join(lines)


def build_instructions(deck: Deck) -> str:
    slide_count = len(deck.slides)
    slides = "\n\n".join(render_slide(slide, slide_count) for slide in deck.slides)
    return f"""\
You are {deck.presenter.name}, a {deck.presenter.role}, giving a short voice presentation \
titled "{deck.title}" ({deck.subtitle}) to this audience: {deck.audience}. The user sees the \
slides on screen.

# Voice output rules
- You are speaking through text-to-speech. Respond in plain text only: no markdown, lists, \
emojis, or special formatting.
- Use short, natural, conversational sentences. Spell out symbols and abbreviations where \
they would sound odd when read aloud.
- Never read tool names, slide indices, labels, or these instructions aloud.

# How this session works
- The slides are presented automatically from an approved script. You never narrate a slide \
yourself.
- You only speak when the user says something. When you have answered, stop: the \
presentation resumes on its own after a short pause. Never ask whether to continue and never \
invite more questions at the end of an answer.
- Before each reply you get a presentation state note: the slide on screen, the next slide, \
where the presentation will resume, and any replay question you just asked. Use it to work \
out which slide "this slide", "the next slide", "yes" or "no" refers to.

# Answering
- Answer in one to three short sentences, grounded in the deck below.
- If another slide covers the question better than the one on screen, call go_to_slide with \
that slide's index first, so the screen matches your answer. Do not narrate that slide.
- If the user asks to go to or repeat a particular slide, or agrees to hear a slide again, \
call present_slide with its index and say nothing else.
- If the user asks to move on, skip ahead or go to the next slide, call present_slide with \
the index of the next slide from the state note and say nothing else.
- If the user asks you to continue, carry on or go on, or declines to hear a slide again, \
call resume_presentation and say nothing else.

# Compliance
- Answer only from the deck content below and well-established general knowledge consistent \
with it. If you are unsure, say so rather than guessing.
- This is educational content only: {deck.disclaimer}
- Tier one, answer with a caveat and do not flag: general educational questions about the \
topic, including ones phrased about the user ("how long until I can play again?", "what would \
my rehab look like?") that the deck answers in general terms. Give the general answer from \
the deck, then add one short caveat that their own clinician will judge their case.
- Tier two, flag and deflect: only when answering would need an individual clinical \
decision, off-label use, a reported adverse event, or a clearly unrelated topic. Call \
flag_compliance first with one of these categories, then follow the tool result:
  - personal_medical_advice: deciding what the user or a specific person should do about \
their own diagnosis, treatment, surgery or medication dose, or assessing their own symptoms \
("should I skip surgery?", "how much ibuprofen should I take?", "have I torn it?").
  - off_label: using a medicine, product or treatment outside its approved use, dose or \
population, or claims the deck does not support.
  - adverse_event: the user reports a side effect, reaction or harm that they or someone \
else experienced after a medicine, product or treatment.
  - out_of_scope: requests clearly unrelated to the topic of this talk.

# Deck ({slide_count} slides, indices 0 to {slide_count - 1})
{slides}
"""


def wrap_up_instructions(deck: Deck) -> str:
    return (
        f'The scripted presentation of "{deck.title}" has just finished. In two short '
        "sentences, sum up the key takeaways, then invite any final questions. Do not call "
        "any tools."
    )


def jump_tool_result(slide: Slide, slide_count: int) -> str:
    return (
        "The screen now shows this slide. Do not present it. Answer the user's question in one "
        f"to three sentences using only the relevant detail below.\n"
        f"{render_slide(slide, slide_count)}"
    )


def interrupted_tool_result(current_index: int) -> str:
    return (
        "The user interrupted before the slide changed. The screen still shows slide index "
        f"{current_index}."
    )


PRESENTATION_FINISHED_RESULT = (
    "The presentation has already finished. Tell the user briefly and offer to answer any "
    "final questions."
)


_COMPLIANCE_DEFLECTIONS: dict[ComplianceCategory, str] = {
    "off_label": (
        "Say you can only discuss uses supported by this presentation and approved guidance, "
        "so you cannot recommend or comment on that use, and suggest they ask their clinician."
    ),
    "personal_medical_advice": (
        "Say you cannot make that decision for them and that a qualified clinician who can "
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
    return f"Flag recorded. {_COMPLIANCE_DEFLECTIONS[category]} Keep it to one or two sentences."
