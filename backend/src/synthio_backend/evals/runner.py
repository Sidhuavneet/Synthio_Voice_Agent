"""Runs eval cases through the real presenter agent with LiveKit Agents' testing API.

Each case gets a fresh text-only session (no audio) with the configured LiveKit Inference
LLM, starting on slide 0 with no prior conversation.
"""

import asyncio
import json
import logging
from collections.abc import Sequence

from livekit.agents import AgentSession, FunctionCallEvent, RunEvent, RunResult, inference

from synthio_backend.agent.events import AgentEvent
from synthio_backend.agent.presenter import PresenterAgent, max_tool_steps
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideController
from synthio_backend.decks.models import Deck
from synthio_backend.evals.dataset import EvalCase
from synthio_backend.evals.scoring import CaseResult, case_result

logger = logging.getLogger(__name__)

CASE_TIMEOUT_S = 90.0
_START_SLIDE = 0


class _DiscardEvents:
    def publish(self, event: AgentEvent) -> None:
        """Evals check tool calls, not the data packets they would publish."""


class _EvalPresenter(PresenterAgent):
    async def on_enter(self) -> None:
        """No opening narration: each case starts straight with the user's message."""


def _function_calls(events: Sequence[RunEvent], name: str) -> list[dict[str, object]]:
    calls = []
    for event in events:
        if isinstance(event, FunctionCallEvent) and event.item.name == name:
            try:
                args = json.loads(event.item.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(args if isinstance(args, dict) else {})
    return calls


def routed_slide(events: Sequence[RunEvent], start: int) -> int | None:
    """Index of the last go_to_slide call, or ``start`` when the agent stayed put."""
    jumps = _function_calls(events, "go_to_slide")
    if not jumps:
        return start
    index = jumps[-1].get("index")
    return index if isinstance(index, int) else None


def raised_flag(events: Sequence[RunEvent]) -> str | None:
    flags = _function_calls(events, "flag_compliance")
    category = flags[0].get("category") if flags else None
    return category if isinstance(category, str) else None


async def run_case(deck: Deck, llm_model: str, case: EvalCase) -> CaseResult:
    slides = SlideController(len(deck.slides))
    await slides.go_to(_START_SLIDE)
    agent = _EvalPresenter(deck, slides, SessionLog(), _DiscardEvents())
    try:
        async with (
            asyncio.timeout(CASE_TIMEOUT_S),
            inference.LLM(model=llm_model) as model,
            AgentSession(llm=model, max_tool_steps=max_tool_steps(len(deck.slides))) as session,
        ):
            await session.start(agent)
            result: RunResult[None] = await session.run(user_input=case.user_input)
    # One failing case (API error, timeout, unexpected model behaviour) must not stop the run.
    except Exception as exc:
        logger.warning("eval case failed: %s", case.user_input, exc_info=True)
        return case_result(case, None, None, error=repr(exc))
    return case_result(case, routed_slide(result.events, _START_SLIDE), raised_flag(result.events))


async def run_cases(
    deck: Deck, llm_model: str, cases: Sequence[EvalCase], concurrency: int
) -> list[CaseResult]:
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded(case: EvalCase) -> CaseResult:
        async with semaphore:
            return await run_case(deck, llm_model, case)

    return list(await asyncio.gather(*(bounded(case) for case in cases)))
