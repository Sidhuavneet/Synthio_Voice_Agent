"""End-of-session report for the ``session.report`` RPC (see docs/CONTRACT.md section 5).

Facts come from the session log, including the questions: every user turn but a
backchannel ("mhm", "okay") is listed, on the slide it was answered on. One structured-output
LLM call over the chat history writes the summary, follow-ups and interests, and enriches
the questions (wording, answered); it never adds or drops one. If that call fails or times
out the report still carries the facts, with the LLM-only fields left empty.
"""

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable, Sequence
from typing import Literal

from livekit import rtc
from livekit.agents import APIConnectOptions, APIError, llm
from pydantic import BaseModel, Field, ValidationError

from synthio_backend.agent.events import ComplianceFlagEvent
from synthio_backend.agent.providers import ChatLLM
from synthio_backend.agent.session_log import SessionLog, UserTurn
from synthio_backend.decks.models import CamelModel, Deck

logger = logging.getLogger(__name__)

# RPC payloads are capped at 15 KiB; stay safely below it.
REPORT_MAX_BYTES = 15_000
_MAX_TEXT_CHARS = 300
_MAX_SUMMARY_CHARS = 1_200
_MAX_LIST_ITEMS = 20
# Keeps the LLM prompt bounded on very long sessions; the most recent part is kept.
_MAX_TRANSCRIPT_CHARS = 30_000

# The frontend waits 30 s for the RPC (REPORT_RPC_TIMEOUT_MS), minus _RESPONSE_MARGIN_S.
LLM_TIMEOUT_S = 25.0
# Each LLM but the last in the chain gets one try of at most this long, so a failing or hung
# primary still leaves the fallback time to answer within LLM_TIMEOUT_S. The Google plugin
# sends this as the request deadline, and Gemini rejects any deadline under 10 s with
# 400 INVALID_ARGUMENT ("Minimum allowed deadline is 10s"), failing every attempt.
_ATTEMPT_TIMEOUT_S = 12.0
_ATTEMPT = APIConnectOptions(max_retry=0, timeout=_ATTEMPT_TIMEOUT_S)
# Time kept in hand to assemble and send the response before the caller gives up.
_RESPONSE_MARGIN_S = 3.0


class ReportSlide(CamelModel):
    index: int
    title: str
    time_sec: int


class ReportQuestion(CamelModel):
    question: str
    slide_index: int
    answered: bool


FollowUpKind = Literal["adverse_event", "medical_information", "follow_up"]


class AdverseEventCriteria(CamelModel):
    """The four minimum criteria for a valid adverse event report, as heard in the session."""

    identifiable_patient: bool = Field(
        description="A specific person who had the event is mentioned (e.g. 'my mother', 'I')"
    )
    identifiable_reporter: bool = Field(description="The person reporting it can be identified")
    suspect_product: bool = Field(description="A specific medicine or product is named")
    adverse_event: bool = Field(description="A specific side effect or harm is described")


class FollowUp(CamelModel):
    kind: FollowUpKind = Field(
        description="adverse_event: a reported side effect or harm to pass to safety; "
        "medical_information: a question needing a documented answer (unanswered, off-label "
        "or deflected); follow_up: anything else, such as sending a resource"
    )
    text: str = Field(description="The action, in one sentence")
    ae_criteria: AdverseEventCriteria | None = Field(
        default=None, description="Only for adverse_event; null otherwise"
    )


class SessionReport(CamelModel):
    ok: Literal[True] = True
    deck_id: str
    duration_sec: int
    summary: str
    slides: list[ReportSlide]
    questions: list[ReportQuestion]
    compliance_flags: list[ComplianceFlagEvent]
    follow_ups: list[FollowUp]
    interests: list[str]


class InsightQuestion(BaseModel):
    turn: int = Field(description="Number of the user turn in the numbered list")
    question: str = Field(description="The user's question or remark, briefly paraphrased")
    answered: bool = Field(description="Whether the presenter actually answered it")


class ReportInsights(BaseModel):
    """Structured output requested from the LLM."""

    summary: str = Field(description="Two to three sentence overview of the conversation")
    questions: list[InsightQuestion] = Field(
        description="One entry per numbered user turn, in order"
    )
    follow_ups: list[FollowUp] = Field(
        description="Actionable follow-up items: reported adverse events, unanswered or open "
        "questions, deflected topics"
    )
    interests: list[str] = Field(description="Topics the user engaged with most, most first")


EMPTY_INSIGHTS = ReportInsights(summary="", questions=[], follow_ups=[], interests=[])

Completer = Callable[[llm.ChatContext], Awaitable[str]]
"""Runs one structured-output LLM call and returns the raw JSON text."""

_INSIGHTS_PROMPT = """\
You analyse a finished conversation between a medical-education presenter (an AI voice agent \
presenting a slide deck) and a user. Use only what is in the material provided; do not invent \
questions or interests. Write in plain English, third person ("The user ..."). Keep each list \
item under twenty words. Return empty lists when there is nothing to report. The presenter's \
slide narration is scripted; only the user's questions and the presenter's answers matter for \
questions and follow-ups. List every numbered user turn under questions, with its number \
as turn; add no others. Every question marked as not answered must also appear in \
follow-ups. Every reported adverse event needs its own adverse_event follow-up that quotes \
the user's report; mark each criterion true only if it was actually stated."""


def llm_completer(chain: Sequence[ChatLLM]) -> Completer:
    """Tries each LLM in failover order. ``llm.FallbackAdapter.chat`` does not forward
    ``response_format``, so the chain is walked here instead of through the adapter."""
    if not chain:
        raise ValueError("at least one LLM is required")

    async def complete(chat_ctx: llm.ChatContext) -> str:
        *fallible, last = chain
        for model in fallible:
            try:
                response = await model.chat(
                    chat_ctx=chat_ctx, response_format=ReportInsights, conn_options=_ATTEMPT
                ).collect()
            except APIError as exc:
                logger.warning("report LLM %s failed, trying the next one: %r", model.label, exc)
                continue
            return response.text
        response = await last.chat(chat_ctx=chat_ctx, response_format=ReportInsights).collect()
        return response.text

    return complete


_BACKCHANNEL_TEXT = (
    "mhm mhmm mm mmhmm hmm hm uh um huh ah oh ok okay yes yeah yep yup no nope sure right "
    "alright cool great nice good fine thanks thank you got it i see go on continue please sounds"
)
_BACKCHANNEL_WORDS = frozenset(_BACKCHANNEL_TEXT.split())
_MAX_BACKCHANNEL_WORDS = 4


def is_backchannel(text: str) -> bool:
    """A short reply made only of fillers and acknowledgements ("mhm", "okay, go on")."""
    words = re.findall(r"[a-z]+", text.casefold())
    return len(words) <= _MAX_BACKCHANNEL_WORDS and all(w in _BACKCHANNEL_WORDS for w in words)


def _question_turns(log: SessionLog) -> list[tuple[int, UserTurn]]:
    """User turns worth listing as questions, with their 1-based number in the log."""
    return [
        (number, turn)
        for number, turn in enumerate(log.turns, start=1)
        if not is_backchannel(turn.text)
    ]


def build_insights_input(deck: Deck, log: SessionLog, history: Sequence[llm.ChatItem]) -> str:
    slides = "\n".join(f"{slide.index}: {slide.title}" for slide in deck.slides)
    turns = "\n".join(
        f"{number}. [slide {turn.slide_index}] {turn.text}" for number, turn in _question_turns(log)
    )
    flags = "\n".join(f"{flag.category}: {flag.question}" for flag in log.flags)
    lines = []
    for item in history:
        if isinstance(item, llm.ChatMessage) and item.role in ("user", "assistant"):
            text = item.text_content
            if text:
                lines.append(f"{'User' if item.role == 'user' else 'Presenter'}: {text}")
    transcript = "\n".join(lines)[-_MAX_TRANSCRIPT_CHARS:]
    return (
        f'Deck "{deck.title}" slides (index: title):\n{slides}\n\n'
        f"Numbered user turns, with the slide on screen when each was answered:\n"
        f"{turns or '(none)'}\n\n"
        f"Compliance flags raised:\n{flags or '(none)'}\n\n"
        f"Transcript:\n{transcript or '(empty)'}"
    )


_CODE_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE)


def parse_insights(text: str) -> ReportInsights:
    """Parses the LLM's JSON, also when wrapped in a Markdown code fence."""
    fenced = _CODE_FENCE.match(text)
    return ReportInsights.model_validate_json(fenced.group(1) if fenced else text)


async def generate_insights(
    complete: Completer, material: str, timeout_s: float
) -> ReportInsights | None:
    """The LLM's insights, or None (logged with the reason) when the report must fall back
    to facts only."""
    chat_ctx = llm.ChatContext.empty()
    chat_ctx.add_message(role="system", content=_INSIGHTS_PROMPT)
    chat_ctx.add_message(role="user", content=material)
    try:
        async with asyncio.timeout(timeout_s):
            text = await complete(chat_ctx)
    except TimeoutError:
        logger.warning("report insights timed out after %.1f s, sending facts only", timeout_s)
        return None
    # Any LLM failure (not only APIError) must still leave the caller a facts-only report.
    except Exception as exc:
        logger.warning("report insights failed, sending facts only: %r", exc)
        return None
    try:
        insights = parse_insights(text)
    except ValidationError as exc:
        logger.warning(
            "report insights unparseable, sending facts only: %s; response: %.500r", exc, text
        )
        return None
    if not insights.summary.strip():
        logger.warning("report LLM returned an empty summary")
    return insights


def _clip(text: str, limit: int = _MAX_TEXT_CHARS) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _clip_all(items: Sequence[str]) -> list[str]:
    return [_clip(item) for item in items[:_MAX_LIST_ITEMS] if item.strip()]


def _encoded_size(report: SessionReport) -> int:
    return len(report.model_dump_json(by_alias=True).encode())


def _is_followed_up(question: str, follow_ups: Sequence[FollowUp]) -> bool:
    needle = question.casefold().strip().rstrip("?.!")
    return any(needle in item.text.casefold() for item in follow_ups)


def _clip_follow_ups(items: Sequence[FollowUp]) -> list[FollowUp]:
    return [
        item.model_copy(
            update={
                "text": _clip(item.text),
                # Criteria only make sense on an adverse event.
                "ae_criteria": item.ae_criteria if item.kind == "adverse_event" else None,
            }
        )
        for item in items[:_MAX_LIST_ITEMS]
        if item.text.strip()
    ]


def _complete_follow_ups(
    questions: Sequence[ReportQuestion],
    flags: Sequence[ComplianceFlagEvent],
    follow_ups: Sequence[FollowUp],
) -> list[FollowUp]:
    """Follow-ups plus one per adverse event flag and one per open question they do not
    mention yet, so the report never drops an adverse event (even when the LLM failed) or
    lists an open question while saying there is nothing to follow up."""
    reported = [item for item in follow_ups if item.kind == "adverse_event"]
    events = [
        FollowUp(kind="adverse_event", text=f"Report the adverse event: {flag.question}")
        for flag in flags
        if flag.category == "adverse_event" and not _is_followed_up(flag.question, reported)
    ]
    # Not clipped: the question is already clipped and must stay findable in the item.
    open_questions = [
        FollowUp(kind="medical_information", text=f"Follow up on the open question: {q.question}")
        for q in questions
        if not q.answered and not _is_followed_up(q.question, follow_ups)
    ]
    # Adverse events first: truncation to the size limit drops items from the end.
    return [*events, *follow_ups, *open_questions][:_MAX_LIST_ITEMS]


def _drop_unfollowed(report: SessionReport) -> SessionReport:
    """Drops open questions whose follow-up was truncated away by ``_fit``."""
    questions = [
        q for q in report.questions if q.answered or _is_followed_up(q.question, report.follow_ups)
    ]
    return report.model_copy(update={"questions": questions})


def _fit(report: SessionReport, max_bytes: int) -> SessionReport:
    """Drops items from the end of the longest list until the report fits."""
    while _encoded_size(report) > max_bytes:
        lists: dict[str, Sequence[object]] = {
            "questions": report.questions,
            "compliance_flags": report.compliance_flags,
            "follow_ups": report.follow_ups,
            "interests": report.interests,
        }
        name, items = max(lists.items(), key=lambda entry: len(entry[1]))
        if not items:
            break
        report = report.model_copy(update={name: list(items[:-1])})
    return report


def _report_questions(
    deck: Deck, log: SessionLog, insights: Sequence[InsightQuestion]
) -> list[ReportQuestion]:
    """Every listed user turn, in order, on the slide it was answered on. The LLM's entry for
    a turn supplies the wording and the answered flag; without one the user's own words are
    used and the turn counts as answered (the presenter replies to every turn)."""
    enriched: dict[int, InsightQuestion] = {}
    for item in insights:
        enriched.setdefault(item.turn, item)
    questions = []
    for number, turn in _question_turns(log)[:_MAX_LIST_ITEMS]:
        if not 0 <= turn.slide_index < len(deck.slides):
            continue
        match = enriched.get(number)
        text = match.question if match is not None and match.question.strip() else turn.text
        questions.append(
            ReportQuestion(
                question=_clip(text.strip()),
                slide_index=turn.slide_index,
                answered=match.answered if match is not None else True,
            )
        )
    return questions


def assemble_report(
    deck: Deck, log: SessionLog, insights: ReportInsights, max_bytes: int = REPORT_MAX_BYTES
) -> SessionReport:
    slide_seconds = log.slide_seconds()
    questions = _report_questions(deck, log, insights.questions)
    flags = [
        flag.model_copy(update={"question": _clip(flag.question)})
        for flag in log.flags[:_MAX_LIST_ITEMS]
    ]
    report = SessionReport(
        deck_id=deck.id,
        duration_sec=round(log.duration_seconds()),
        summary=_clip(insights.summary, _MAX_SUMMARY_CHARS),
        slides=[
            ReportSlide(
                index=slide.index,
                title=slide.title,
                time_sec=round(slide_seconds.get(slide.index, 0.0)),
            )
            for slide in deck.slides
        ],
        questions=questions,
        compliance_flags=flags,
        follow_ups=_complete_follow_ups(questions, flags, _clip_follow_ups(insights.follow_ups)),
        interests=_clip_all(insights.interests),
    )
    return _drop_unfollowed(_fit(report, max_bytes))


class SessionReporter:
    def __init__(
        self,
        deck: Deck,
        log: SessionLog,
        complete: Completer,
        history: Callable[[], Sequence[llm.ChatItem]],
    ) -> None:
        self._deck = deck
        self._log = log
        self._complete = complete
        self._history = history

    async def build(self, llm_timeout_s: float) -> SessionReport:
        material = build_insights_input(self._deck, self._log, self._history())
        insights = await generate_insights(self._complete, material, llm_timeout_s)
        return assemble_report(self._deck, self._log, insights or EMPTY_INSIGHTS)


async def handle_report(reporter: SessionReporter, data: rtc.RpcInvocationData) -> str:
    llm_timeout_s = min(LLM_TIMEOUT_S, data.response_timeout - _RESPONSE_MARGIN_S)
    try:
        report = await reporter.build(llm_timeout_s=max(llm_timeout_s, 0.0))
    # Last-resort boundary: the caller gets the contract error shape instead of a bare
    # APPLICATION_ERROR.
    except Exception as exc:
        logger.exception("session.report failed")
        return json.dumps({"ok": False, "error": str(exc) or type(exc).__name__})
    return report.model_dump_json(by_alias=True)
