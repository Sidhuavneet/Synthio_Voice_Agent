"""The presenter Agent: narrates the deck and moves slides via LLM tools."""

import logging

from livekit.agents import Agent, RunContext, ToolError, function_tool

from synthio_backend.agent.events import ComplianceCategory, EventSink
from synthio_backend.agent.prompts import (
    build_instructions,
    compliance_tool_result,
    interrupted_tool_result,
    jump_tool_result,
    navigation_instructions,
    opening_instructions,
    slide_tool_result,
)
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideController, SlideIndexError
from synthio_backend.decks.models import Deck

logger = logging.getLogger(__name__)

# Headroom over one next_slide call per slide so a full presentation can chain without
# hitting the per-turn tool step limit.
_EXTRA_TOOL_STEPS = 2


def max_tool_steps(slide_count: int) -> int:
    return slide_count + _EXTRA_TOOL_STEPS


class PresenterAgent(Agent):
    def __init__(
        self, deck: Deck, slides: SlideController, log: SessionLog, events: EventSink
    ) -> None:
        super().__init__(instructions=build_instructions(deck))
        self._deck = deck
        self._slides = slides
        self._log = log
        self._events = events

    async def on_enter(self) -> None:
        self.session.generate_reply(instructions=opening_instructions(self._deck))

    async def show_slide_for_user(self, index: int) -> None:
        """Handles a user-initiated slide change: stop talking, switch, present it."""
        self._slides.validate(index)
        # Interrupt first so a pending next_slide call is cancelled before the switch.
        await self.session.interrupt(force=True)
        await self._slides.go_to(index)
        self.session.generate_reply(
            instructions=navigation_instructions(self._deck.slides[index], self._slides.slide_count)
        )

    @function_tool
    async def next_slide(self, context: RunContext[None]) -> str:
        """Advance to the next slide. Call this only after you have finished narrating the
        current slide and briefly invited questions."""
        # Tools run while the preceding speech is still playing; switch only once it ends.
        await context.wait_for_playout()
        # An interruption also ends the playout: the user cut in, so stay on this slide.
        if context.speech_handle.interrupted:
            logger.info("next_slide skipped: speech was interrupted")
            return interrupted_tool_result(self._slides.index)
        try:
            index = await self._slides.next()
        except SlideIndexError as exc:
            raise ToolError(
                f"{exc}. Summarise the key takeaways and invite final questions."
            ) from exc
        logger.info("advanced to slide %d", index)
        return slide_tool_result(self._deck.slides[index], self._slides.slide_count)

    @function_tool
    async def go_to_slide(self, context: RunContext[None], index: int, reason: str) -> str:
        """Show a specific slide. Call this before answering a question that another slide
        covers better, so the screen matches your answer.

        Args:
            index: Zero-based index of the slide to show.
            reason: Short reason for switching, e.g. which question it answers.
        """
        await context.wait_for_playout()
        if context.speech_handle.interrupted:
            logger.info("go_to_slide %d skipped: speech was interrupted", index)
            return interrupted_tool_result(self._slides.index)
        try:
            await self._slides.go_to(index)
        except SlideIndexError as exc:
            raise ToolError(str(exc)) from exc
        self._log.route_latest_turn(index)
        logger.info("jumped to slide %d: %s", index, reason)
        return jump_tool_result(self._deck.slides[index], self._slides.slide_count)

    @function_tool
    async def flag_compliance(self, category: ComplianceCategory, question: str) -> str:
        """Record a compliance issue. Call this first, before replying, whenever the user asks
        about off-label use, asks for personal medical advice, reports an adverse event, or
        asks something outside the topic of this talk.

        Args:
            category: off_label, personal_medical_advice, adverse_event or out_of_scope.
            question: The user's message, close to verbatim.
        """
        flag = self._log.add_flag(category, question, self._slides.index)
        self._events.publish(flag)
        logger.info("compliance flag %s: %s", category, flag.id)
        return compliance_tool_result(category)
