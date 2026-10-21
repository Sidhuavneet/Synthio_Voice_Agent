import json
from typing import cast

import pytest
from livekit import rtc
from livekit.agents import FunctionTool, RunContext, ToolError

from synthio_backend.agent.deck_selection import select_deck
from synthio_backend.agent.events import AgentEvent
from synthio_backend.agent.navigation import handle_navigate, parse_navigate_payload
from synthio_backend.agent.presenter import PresenterAgent
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideController
from synthio_backend.decks.models import Deck
from synthio_backend.decks.repository import DeckRepository


class FakeNavigator:
    def __init__(self, slide_count: int) -> None:
        self.slides = SlideController(slide_count)

    async def show_slide_for_user(self, index: int) -> None:
        await self.slides.go_to(index)


def _invocation(payload: str) -> rtc.RpcInvocationData:
    return rtc.RpcInvocationData(
        request_id="req", caller_identity="user-1", payload=payload, response_timeout=5.0
    )


def test_parse_navigate_payload() -> None:
    assert parse_navigate_payload('{"index": 3}') == 3


@pytest.mark.parametrize("payload", ["not json", "[]", '{"index": "2"}', '{"index": true}', "{}"])
def test_parse_navigate_payload_rejects_invalid(payload: str) -> None:
    with pytest.raises(ValueError, match=r"JSON|index"):
        parse_navigate_payload(payload)


async def test_handle_navigate_ok() -> None:
    navigator = FakeNavigator(5)
    response = await handle_navigate(navigator, _invocation('{"index": 2}'))
    assert json.loads(response) == {"ok": True, "index": 2}
    assert navigator.slides.index == 2


@pytest.mark.parametrize("payload", ['{"index": 9}', "garbage"])
async def test_handle_navigate_error(payload: str) -> None:
    navigator = FakeNavigator(5)
    response = json.loads(await handle_navigate(navigator, _invocation(payload)))
    assert response["ok"] is False
    assert response["error"]
    assert navigator.slides.index == 0


class StoppedNavigator:
    async def show_slide_for_user(self, index: int) -> None:
        raise RuntimeError("AgentSession isn't running")


async def test_handle_navigate_session_not_running() -> None:
    response = json.loads(await handle_navigate(StoppedNavigator(), _invocation('{"index": 1}')))
    assert response == {"ok": False, "error": "AgentSession isn't running"}


@pytest.mark.parametrize(
    "metadata", ['{"deckId":"sample-deck"}', '{"deckId":"missing"}', "", "{bad", '{"deckId":1}']
)
def test_select_deck_falls_back_to_first(repository: DeckRepository, metadata: str) -> None:
    assert select_deck(repository, metadata).id == "sample-deck"


class RecordingSink:
    def __init__(self) -> None:
        self.events: list[AgentEvent] = []

    def publish(self, event: AgentEvent) -> None:
        self.events.append(event)


def test_presenter_exposes_tools(deck: Deck) -> None:
    agent = PresenterAgent(deck, SlideController(len(deck.slides)), SessionLog(), RecordingSink())
    names = {tool.info.name for tool in agent.tools if isinstance(tool, FunctionTool)}
    assert names == {"next_slide", "go_to_slide", "flag_compliance"}


class StubSpeechHandle:
    def __init__(self, interrupted: bool) -> None:
        self.interrupted = interrupted


class StubRunContext:
    def __init__(self, interrupted: bool = False) -> None:
        self.speech_handle = StubSpeechHandle(interrupted)

    async def wait_for_playout(self) -> None:
        return None


_CONTEXT = cast(RunContext[None], StubRunContext())
_INTERRUPTED = cast(RunContext[None], StubRunContext(interrupted=True))


async def _presenter(deck: Deck, start: int = 0) -> tuple[PresenterAgent, SlideController]:
    slides = SlideController(len(deck.slides))
    await slides.go_to(start)
    return PresenterAgent(deck, slides, SessionLog(), RecordingSink()), slides


async def test_next_slide_advances_and_returns_slide(deck: Deck) -> None:
    agent, slides = await _presenter(deck)
    result = await agent.next_slide(_CONTEXT)
    assert slides.index == 1
    assert deck.slides[1].title in result


async def test_next_slide_on_last_slide_raises(deck: Deck) -> None:
    agent, slides = await _presenter(deck, start=len(deck.slides) - 1)
    with pytest.raises(ToolError, match="last slide"):
        await agent.next_slide(_CONTEXT)
    assert slides.index == len(deck.slides) - 1


async def test_next_slide_after_interruption_stays(deck: Deck) -> None:
    agent, slides = await _presenter(deck)
    result = await agent.next_slide(_INTERRUPTED)
    assert slides.index == 0
    assert "interrupted" in result


async def test_go_to_slide_after_interruption_stays(deck: Deck) -> None:
    agent, slides = await _presenter(deck)
    result = await agent.go_to_slide(_INTERRUPTED, 3, "question about slide 3")
    assert slides.index == 0
    assert "interrupted" in result


async def test_go_to_slide_returns_slide(deck: Deck) -> None:
    agent, slides = await _presenter(deck)
    result = await agent.go_to_slide(_CONTEXT, 3, "question about slide 3")
    assert slides.index == 3
    assert deck.slides[3].title in result


async def test_go_to_slide_rejects_bad_index(deck: Deck) -> None:
    agent, slides = await _presenter(deck)
    with pytest.raises(ToolError, match="out of range"):
        await agent.go_to_slide(_CONTEXT, 99, "bad")
    assert slides.index == 0


async def test_go_to_slide_routes_latest_user_turn(deck: Deck) -> None:
    slides = SlideController(len(deck.slides))
    log = SessionLog()
    log.record_user_turn("how is it treated?", slides.index)
    agent = PresenterAgent(deck, slides, log, RecordingSink())
    await agent.go_to_slide(_CONTEXT, 3, "treatment question")
    assert log.turns[-1].slide_index == 3


async def test_flag_compliance_records_and_publishes(deck: Deck) -> None:
    slides = SlideController(len(deck.slides))
    await slides.go_to(2)
    log = SessionLog()
    sink = RecordingSink()
    agent = PresenterAgent(deck, slides, log, sink)
    result = await agent.flag_compliance("adverse_event", "my knee swelled after the injection")
    (flag,) = log.flags
    assert sink.events == [flag]
    assert flag.category == "adverse_event"
    assert flag.slide_index == 2
    assert "reporting line" in result
    assert slides.index == 2
