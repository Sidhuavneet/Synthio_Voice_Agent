"""End-of-session report for the ``session.report`` RPC (see docs/CONTRACT.md section 5).

Facts come from the session log; the summary, questions, follow-ups and interests come from
one structured-output LLM call over the chat history. If that call fails or times out the
report still carries the facts, with the LLM fields left empty.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import Literal

from livekit import rtc
from livekit.agents import APIConnectOptions, APIError, llm
from pydantic import BaseModel, Field, ValidationError

from synthio_backend.agent.events import ComplianceFlagEvent
from synthio_backend.agent.providers import ChatLLM
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.decks.models import CamelModel, Deck

logger = logging.getLogger(__name__)

# RPC payloads are capped at 15 KiB; stay safely below it.
REPORT_MAX_BYTES = 15_000
_MAX_TEXT_CHARS = 300
_MAX_SUMMARY_CHARS = 1_200
_MAX_LIST_ITEMS = 20
# Keeps the LLM prompt bounded on very long sessions; the most recent part is kept.
_MAX_TRANSCRIPT_CHARS = 30_000

LLM_TIMEOUT_S = 20.0
# Each LLM but the last in the chain gets one try of at most this long, so a failing or hung
# primary still leaves the fallback time to answer within LLM_TIMEOUT_S.
_ATTEMPT = APIConnectOptions(max_retry=0, timeout=8.0)
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
    question: str = Field(description="The user's question, briefly paraphrased")
    slide_index: int = Field(description="Index of the slide shown when it was answered")
    answered: bool = Field(description="Whether the presenter actually answered it")


class ReportInsights(BaseModel):
    """Structured output requested from the LLM."""

    summary: str = Field(description="Two to three sentence overview of the conversation")
    questions: list[InsightQuestion] = Field(
        description="Genuine questions the user asked, in order; not replies like 'yes'"
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
questions and follow-ups. Every question marked as not answered must also appear in \
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


def build_insights_input(deck: Deck, log: SessionLog, history: Sequence[llm.ChatItem]) -> str:
    slides = "\n".join(f"{slide.index}: {slide.title}" for slide in deck.slides)
    turns = "\n".join(f"[slide {turn.slide_index}] {turn.text}" for turn in log.turns)
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
        f"User turns, with the slide on screen when each was answered:\n{turns or '(none)'}\n\n"
        f"Compliance flags raised:\n{flags or '(none)'}\n\n"
        f"Transcript:\n{transcript or '(empty)'}"
    )


async def generate_insights(
    complete: Completer, material: str, timeout_s: float
) -> ReportInsights | None:
    chat_ctx = llm.ChatContext.empty()
    chat_ctx.add_message(role="system", content=_INSIGHTS_PROMPT)
    chat_ctx.add_message(role="user", content=material)
    try:
        async with asyncio.timeout(timeout_s):
            text = await complete(chat_ctx)
        return ReportInsights.model_validate_json(text)
    except (TimeoutError, APIError, ValidationError) as exc:
        logger.warning("report insights unavailable, sending facts only: %r", exc)
        return None


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


def assemble_report(
    deck: Deck, log: SessionLog, insights: ReportInsights, max_bytes: int = REPORT_MAX_BYTES
) -> SessionReport:
    slide_seconds = log.slide_seconds()
    questions = [
        ReportQuestion(question=_clip(q.question), slide_index=q.slide_index, answered=q.answered)
        for q in insights.questions[:_MAX_LIST_ITEMS]
        if 0 <= q.slide_index < len(deck.slides) and q.question.strip()
    ]
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
