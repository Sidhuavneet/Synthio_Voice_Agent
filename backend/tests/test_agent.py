import json
from typing import cast

import pytest
from livekit import rtc
from livekit.agents import Agent, FunctionTool, ModelSettings, RunContext, ToolError, llm

from synthio_backend.agent.deck_selection import select_job
from synthio_backend.agent.events import AgentEvent
from synthio_backend.agent.interrupt import handle_interrupt
from synthio_backend.agent.navigation import handle_navigate, parse_navigate_payload
from synthio_backend.agent.presentation import PresentationController
from synthio_backend.agent.presenter import PresenterAgent
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideController
from synthio_backend.decks.models import Deck
from synthio_backend.decks.repository import DeckRepository
from tests.fakes import FakeProgress, FakeSpeech


class FakeNavigator:
    def __init__(self, slide_count: int) -> None:
        self.slides = SlideController(slide_count)

    async def navigate(self, index: int) -> None:
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
    async def navigate(self, index: int) -> None:
        raise RuntimeError("AgentSession isn't running")


async def test_handle_navigate_session_not_running() -> None:
    response = json.loads(await handle_navigate(StoppedNavigator(), _invocation('{"index": 1}')))
    assert response == {"ok": False, "error": "AgentSession isn't running"}


class FakeInterrupter:
    def __init__(self, error: str | None = None) -> None:
        self.calls = 0
        self._error = error

    async def interrupt_for_user(self) -> None:
        self.calls += 1
        if self._error is not None:
            raise RuntimeError(self._error)


@pytest.mark.parametrize("payload", ["{}", "", "garbage"])
async def test_handle_interrupt_ok(payload: str) -> None:
    target = FakeInterrupter()
    response = await handle_interrupt(target, _invocation(payload))
    assert json.loads(response) == {"ok": True}
    assert target.calls == 1


async def test_handle_interrupt_session_not_running() -> None:
    target = FakeInterrupter(error="AgentSession isn't running")
    response = json.loads(await handle_interrupt(target, _invocation("{}")))
    assert response == {"ok": False, "error": "AgentSession isn't running"}


@pytest.mark.parametrize(
    "metadata", ['{"deckId":"sample-deck"}', '{"deckId":"missing"}', "", "{bad", '{"deckId":1}']
)
def test_select_job_falls_back_to_first_deck(repository: DeckRepository, metadata: str) -> None:
    job = select_job(repository, metadata)
    assert job.deck.id == "sample-deck"
    assert job.resume is None


def test_select_job_reads_resume(repository: DeckRepository) -> None:
    metadata = '{"deckId":"sample-deck","resume":{"slideIndex":2,"presented":[0,1]}}'
    resume = select_job(repository, metadata).resume
    assert resume is not None
    assert (resume.slide_index, resume.presented) == (2, [0, 1])


@pytest.mark.parametrize(
    "metadata",
    [
        '{"deckId":"sample-deck","resume":{"slideIndex":9,"presented":[]}}',
        '{"deckId":"sample-deck","resume":{"slideIndex":1,"presented":[7]}}',
        '{"deckId":"sample-deck","resume":"bad"}',
        # Resume state belongs to the requested deck, not to the fallback deck.
        '{"deckId":"missing","resume":{"slideIndex":1,"presented":[0]}}',
    ],
)
def test_select_job_drops_invalid_resume(repository: DeckRepository, metadata: str) -> None:
    assert select_job(repository, metadata).resume is None


class RecordingSink:
    def __init__(self) -> None:
        self.events: list[AgentEvent] = []

    def publish(self, event: AgentEvent) -> None:
        self.events.append(event)


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


class Harness:
    def __init__(self, deck: Deck, log: SessionLog | None = None) -> None:
        self.slides = SlideController(len(deck.slides))
        self.speech = FakeSpeech()
        self.presentation = PresentationController(deck, self.slides, self.speech, FakeProgress())
        self.log = log or SessionLog()
        self.sink = RecordingSink()
        self.agent = PresenterAgent(deck, self.slides, self.presentation, self.log, self.sink)


def test_presenter_exposes_tools(deck: Deck) -> None:
    agent = Harness(deck).agent
    names = {tool.info.name for tool in agent.tools if isinstance(tool, FunctionTool)}
    assert names == {"go_to_slide", "present_slide", "resume_presentation", "flag_compliance"}


async def test_go_to_slide_shows_without_moving_cursor(deck: Deck) -> None:
    h = Harness(deck)
    result = await h.agent.go_to_slide(_CONTEXT, 3, "question about slide 3")
    assert h.slides.index == 3
    assert h.presentation.cursor.slide == 0
    assert deck.slides[3].title in result
    assert "Do not present it" in result


async def test_go_to_slide_after_interruption_stays(deck: Deck) -> None:
    h = Harness(deck)
    result = await h.agent.go_to_slide(_INTERRUPTED, 3, "question about slide 3")
    assert h.slides.index == 0
    assert "interrupted" in result


async def test_go_to_slide_rejects_bad_index(deck: Deck) -> None:
    h = Harness(deck)
    with pytest.raises(ToolError, match="out of range"):
        await h.agent.go_to_slide(_CONTEXT, 99, "bad")
    assert h.slides.index == 0


async def test_go_to_slide_routes_latest_user_turn(deck: Deck) -> None:
    log = SessionLog()
    log.record_user_turn("how is it treated?", 0)
    h = Harness(deck, log)
    await h.agent.go_to_slide(_CONTEXT, 3, "treatment question")
    assert log.turns[-1].slide_index == 3


async def test_present_slide_moves_cursor_and_returns_no_reply(deck: Deck) -> None:
    h = Harness(deck)
    assert await h.agent.present_slide(_CONTEXT, 2) is None
    assert h.presentation.cursor.slide == 2
    assert h.presentation.mode == "presenting"
    h.presentation.close()


async def test_present_slide_rejects_bad_index(deck: Deck) -> None:
    h = Harness(deck)
    with pytest.raises(ToolError, match="out of range"):
        await h.agent.present_slide(_CONTEXT, 9)


async def test_present_slide_after_interruption_does_nothing(deck: Deck) -> None:
    h = Harness(deck)
    result = await h.agent.present_slide(_INTERRUPTED, 2)
    assert result is not None
    assert "interrupted" in result
    assert h.presentation.mode == "idle"


async def test_resume_presentation_continues(deck: Deck) -> None:
    h = Harness(deck)
    assert await h.agent.resume_presentation(_CONTEXT) is None
    assert h.presentation.mode == "presenting"
    h.presentation.close()


async def test_flag_compliance_records_and_publishes(deck: Deck) -> None:
    h = Harness(deck)
    await h.slides.go_to(2)
    result = await h.agent.flag_compliance("adverse_event", "my knee swelled after the injection")
    (flag,) = h.log.flags
    assert h.sink.events == [flag]
    assert flag.category == "adverse_event"
    assert flag.slide_index == 2
    assert "reporting line" in result
    assert h.slides.index == 2


async def test_llm_node_adds_state_note_without_touching_history(
    deck: Deck, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[llm.ChatContext] = []

    def fake_llm_node(
        agent: Agent, chat_ctx: llm.ChatContext, tools: object, settings: object
    ) -> list[str]:
        seen.append(chat_ctx)
        return []

    monkeypatch.setattr(Agent.default, "llm_node", fake_llm_node)
    h = Harness(deck)
    await h.presentation.show(2)
    history = llm.ChatContext()
    history.add_message(role="user", content="what is on this slide?")
    h.agent.llm_node(history, [], ModelSettings())
    assert len(history.items) == 1
    note = seen[0].items[-1]
    assert isinstance(note, llm.ChatMessage)
    assert note.role == "system"
    assert f'On screen: slide index 2, "{deck.slides[2].title}"' in (note.text_content or "")
