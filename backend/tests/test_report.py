import asyncio
import json

import pytest
from livekit import rtc
from livekit.agents import APIConnectionError, llm

from synthio_backend.agent.report import (
    EMPTY_INSIGHTS,
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


def _insights(**overrides: object) -> ReportInsights:
    values: dict[str, object] = {
        "summary": "The user asked about treatment.",
        "questions": [
            InsightQuestion(question="How is it treated?", slide_index=3, answered=True),
            InsightQuestion(question="Invented slide", slide_index=99, answered=True),
        ],
        "follow_ups": ["Send rehab guide"],
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
    assert body["followUps"] == ["Send rehab guide"]
    assert body["interests"] == ["treatment"]


def test_facts_only_report(deck: Deck) -> None:
    report = assemble_report(deck, _log(), EMPTY_INSIGHTS)
    assert report.summary == ""
    assert report.questions == []
    assert report.follow_ups == report.interests == []
    assert len(report.compliance_flags) == 1


def test_report_is_truncated_to_size_limit(deck: Deck) -> None:
    long_items = [f"item {i} " + "x" * 400 for i in range(50)]
    insights = _insights(summary="s" * 5000, follow_ups=long_items, interests=long_items)
    report = assemble_report(deck, _log(), insights, max_bytes=4000)
    assert len(report.model_dump_json(by_alias=True).encode()) <= 4000
    assert len(report.summary) <= 1200
    assert all(len(item) <= 300 for item in report.follow_ups)
    assert len(report.slides) == len(deck.slides)  # facts are never dropped


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
