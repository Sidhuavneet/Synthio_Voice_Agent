import asyncio
import json

import pytest
from livekit import rtc
from livekit.agents import APIConnectionError, llm

from synthio_backend.agent.report import (
    EMPTY_INSIGHTS,
    AdverseEventCriteria,
    FollowUp,
    InsightQuestion,
    ReportInsights,
    SessionReporter,
    assemble_report,
    build_insights_input,
    generate_insights,
    handle_report,
)
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.decks.models import Deck


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def _log() -> SessionLog:
    clock = FakeClock()
    log = SessionLog(clock=clock)
    clock.now = 30.4
    log.record_slide(3)
    log.record_user_turn("How is it treated?", 3)
    log.add_flag("personal_medical_advice", "Should I skip surgery?", 3)
    clock.now = 42.0
    return log


def _follow_up(text: str) -> FollowUp:
    return FollowUp(kind="follow_up", text=text)


def _texts(items: list[FollowUp]) -> list[str]:
    return [item.text for item in items]


def _insights(**overrides: object) -> ReportInsights:
    values: dict[str, object] = {
        "summary": "The user asked about treatment.",
        "questions": [
            InsightQuestion(question="How is it treated?", slide_index=3, answered=True),
            InsightQuestion(question="Invented slide", slide_index=99, answered=True),
        ],
        "follow_ups": [_follow_up("Send rehab guide")],
        "interests": ["treatment"],
    }
    values.update(overrides)
    return ReportInsights.model_validate(values)


def _history() -> list[llm.ChatItem]:
    ctx = llm.ChatContext.empty()
    ctx.add_message(role="system", content="instructions")
    ctx.add_message(role="assistant", content="Welcome to the talk.")
    ctx.add_message(role="user", content="How is it treated?")
    return ctx.items


def test_assemble_report_combines_facts_and_insights(deck: Deck) -> None:
    report = assemble_report(deck, _log(), _insights())
    body = json.loads(report.model_dump_json(by_alias=True))
    assert body["ok"] is True
    assert body["deckId"] == deck.id
    assert body["durationSec"] == 42
    assert [s["timeSec"] for s in body["slides"]] == [30, 0, 0, 12, 0]
    assert body["slides"][3]["title"] == deck.slides[3].title
    # Questions pointing at slides outside the deck are dropped.
    assert body["questions"] == [
        {"question": "How is it treated?", "slideIndex": 3, "answered": True}
    ]
    (flag,) = body["complianceFlags"]
    assert flag["type"] == "compliance_flag"
    assert flag["category"] == "personal_medical_advice"
    assert body["followUps"] == [
        {"kind": "follow_up", "text": "Send rehab guide", "aeCriteria": None}
    ]
    assert body["interests"] == ["treatment"]


def test_facts_only_report(deck: Deck) -> None:
    report = assemble_report(deck, _log(), EMPTY_INSIGHTS)
    assert report.summary == ""
    assert report.questions == []
    assert report.follow_ups == report.interests == []
    assert len(report.compliance_flags) == 1


def test_report_is_truncated_to_size_limit(deck: Deck) -> None:
    long_items = [f"item {i} " + "x" * 400 for i in range(50)]
    insights = _insights(
        summary="s" * 5000, follow_ups=[_follow_up(i) for i in long_items], interests=long_items
    )
    report = assemble_report(deck, _log(), insights, max_bytes=4000)
    assert len(report.model_dump_json(by_alias=True).encode()) <= 4000
    assert len(report.summary) <= 1200
    assert all(len(item.text) <= 300 for item in report.follow_ups)
    assert len(report.slides) == len(deck.slides)  # facts are never dropped


def test_open_questions_always_have_a_follow_up(deck: Deck) -> None:
    insights = _insights(
        questions=[
            InsightQuestion(question="Can I play on turf?", slide_index=4, answered=False),
            InsightQuestion(question="How is it treated?", slide_index=3, answered=True),
        ],
        follow_ups=[],
    )
    report = assemble_report(deck, _log(), insights)
    assert report.follow_ups == [
        FollowUp(
            kind="medical_information", text="Follow up on the open question: Can I play on turf?"
        )
    ]
    assert [q.answered for q in report.questions] == [False, True]


def test_open_question_already_followed_up_is_not_repeated(deck: Deck) -> None:
    insights = _insights(
        questions=[InsightQuestion(question="Can I play on turf?", slide_index=4, answered=False)],
        follow_ups=[_follow_up("Send guidance on whether she can play on turf")],
    )
    report = assemble_report(deck, _log(), insights)
    assert _texts(report.follow_ups) == [
        "Send guidance on whether she can play on turf",
        "Follow up on the open question: Can I play on turf?",
    ]
    insights = _insights(
        questions=[InsightQuestion(question="Can I play on turf?", slide_index=4, answered=False)],
        follow_ups=[_follow_up("Answer: can I play on turf")],
    )
    report = assemble_report(deck, _log(), insights)
    assert _texts(report.follow_ups) == ["Answer: can I play on turf"]


def test_truncation_never_leaves_an_open_question_without_follow_up(deck: Deck) -> None:
    questions = [
        InsightQuestion(question=f"Open question {i} " + "q" * 200, slide_index=0, answered=False)
        for i in range(20)
    ]
    insights = _insights(questions=questions, follow_ups=[], interests=[])
    report = assemble_report(deck, _log(), insights, max_bytes=4000)
    assert len(report.model_dump_json(by_alias=True).encode()) <= 4000
    for question in report.questions:
        assert any(question.question in item.text for item in report.follow_ups)


def _log_with_adverse_event() -> SessionLog:
    log = _log()
    log.add_flag("adverse_event", "My patient felt dizzy after starting it", 2)
    return log


def test_adverse_event_is_never_dropped_from_follow_ups(deck: Deck) -> None:
    # Even a facts-only report (the LLM call failed) asks for the event to be reported.
    report = assemble_report(deck, _log_with_adverse_event(), EMPTY_INSIGHTS)
    assert report.follow_ups == [
        FollowUp(
            kind="adverse_event",
            text="Report the adverse event: My patient felt dizzy after starting it",
        )
    ]


def test_llm_adverse_event_follow_up_keeps_its_criteria(deck: Deck) -> None:
    criteria = AdverseEventCriteria(
        identifiable_patient=True,
        identifiable_reporter=True,
        suspect_product=True,
        adverse_event=True,
    )
    insights = _insights(
        follow_ups=[
            FollowUp(kind="adverse_event", text="Report dizziness", ae_criteria=criteria),
            FollowUp(kind="follow_up", text="Send leaflet", ae_criteria=criteria),
        ]
    )
    report = assemble_report(deck, _log_with_adverse_event(), insights)
    assert [(item.text, item.ae_criteria) for item in report.follow_ups] == [
        # The LLM's item does not quote the flag, so code still adds one for it.
        ("Report the adverse event: My patient felt dizzy after starting it", None),
        ("Report dizziness", criteria),
        # Criteria are dropped where they do not apply.
        ("Send leaflet", None),
    ]


def test_every_adverse_event_flag_gets_a_follow_up(deck: Deck) -> None:
    log = _log_with_adverse_event()
    log.add_flag("adverse_event", "Another patient got a rash", 3)
    log.add_flag("adverse_event", "One had a headache", 3)
    insights = _insights(
        follow_ups=[
            # Covers the rash; the dizziness is only mentioned by a non-AE item.
            FollowUp(kind="adverse_event", text="Report: another patient got a rash."),
            FollowUp(kind="follow_up", text="Ask about: my patient felt dizzy after starting it"),
        ]
    )
    report = assemble_report(deck, log, insights)
    assert [(item.kind, item.text) for item in report.follow_ups] == [
        (
            "adverse_event",
            "Report the adverse event: My patient felt dizzy after starting it",
        ),
        ("adverse_event", "Report the adverse event: One had a headache"),
        ("adverse_event", "Report: another patient got a rash."),
        ("follow_up", "Ask about: my patient felt dizzy after starting it"),
    ]


def test_insights_input_includes_turns_flags_and_transcript(deck: Deck) -> None:
    material = build_insights_input(deck, _log(), _history())
    assert "[slide 3] How is it treated?" in material
    assert "personal_medical_advice: Should I skip surgery?" in material
    assert "Presenter: Welcome to the talk." in material
    assert "User: How is it treated?" in material
    assert "instructions" not in material


async def test_generate_insights_parses_structured_output() -> None:
    async def complete(ctx: llm.ChatContext) -> str:
        assert [item.type for item in ctx.items] == ["message", "message"]
        return _insights().model_dump_json()

    assert await generate_insights(complete, "material", timeout_s=1) == _insights()


@pytest.mark.parametrize("failure", ["invalid", "api_error", "timeout"])
async def test_generate_insights_falls_back_on_failure(failure: str) -> None:
    async def complete(ctx: llm.ChatContext) -> str:
        if failure == "api_error":
            raise APIConnectionError()
        if failure == "timeout":
            await asyncio.sleep(1)
        return '{"summary": 1}'

    assert await generate_insights(complete, "material", timeout_s=0.05) is None


def _invocation() -> rtc.RpcInvocationData:
    return rtc.RpcInvocationData(
        request_id="req", caller_identity="user-1", payload="{}", response_timeout=30.0
    )


async def test_handle_report_returns_report(deck: Deck) -> None:
    async def complete(ctx: llm.ChatContext) -> str:
        return _insights().model_dump_json()

    reporter = SessionReporter(deck, _log(), complete, history=_history)
    body = json.loads(await handle_report(reporter, _invocation()))
    assert body["ok"] is True
    assert body["summary"] == "The user asked about treatment."


async def test_handle_report_returns_contract_error_on_unexpected_failure(deck: Deck) -> None:
    def broken_history() -> list[llm.ChatItem]:
        raise RuntimeError("history unavailable")

    async def complete(ctx: llm.ChatContext) -> str:
        return "{}"

    reporter = SessionReporter(deck, _log(), complete, history=broken_history)
    body = json.loads(await handle_report(reporter, _invocation()))
    assert body == {"ok": False, "error": "history unavailable"}
