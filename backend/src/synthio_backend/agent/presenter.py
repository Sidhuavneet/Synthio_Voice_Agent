"""The presenter Agent: scripted presenting is delegated to the presentation controller; the
LLM answers questions and steers the presentation through tools."""

import logging
from collections.abc import AsyncIterable

from livekit.agents import (
    Agent,
    FlushSentinel,
    ModelSettings,
    RunContext,
    ToolError,
    function_tool,
    llm,
)

from synthio_backend.agent.events import ComplianceCategory, EventSink
from synthio_backend.agent.presentation import PresentationController
from synthio_backend.agent.prompts import (
    PRESENTATION_FINISHED_RESULT,
    build_instructions,
    compliance_tool_result,
    interrupted_tool_result,
    jump_tool_result,
)
from synthio_backend.agent.session_log import SessionLog
from synthio_backend.agent.slides import SlideController, SlideIndexError
from synthio_backend.agent.turn_context import turn_context_note
from synthio_backend.decks.models import Deck

logger = logging.getLogger(__name__)


class PresenterAgent(Agent):
    def __init__(
        self,
        deck: Deck,
        slides: SlideController,
        presentation: PresentationController,
        log: SessionLog,
        events: EventSink,
    ) -> None:
        super().__init__(instructions=build_instructions(deck))
        self._deck = deck
        self._slides = slides
        self._presentation = presentation
        self._log = log
        self._events = events

    async def on_enter(self) -> None:
        self._presentation.start()

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        # Runs before the reply is scheduled, so no scripted segment is queued behind it.
        self._presentation.on_user_turn()

    def llm_node(
        self,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool],
        model_settings: ModelSettings,
    ) -> AsyncIterable[llm.ChatChunk | str | FlushSentinel]:
        # Added here rather than in on_user_turn_completed: an edited turn context would
        # discard LiveKit's preemptive generation on every turn, and this also refreshes the
        # note for the follow-up reply after a tool call. The copy keeps it out of history.
        chat_ctx = chat_ctx.copy()
        chat_ctx.add_message(
            role="system", content=turn_context_note(self._deck, self._presentation.state())
        )
        return Agent.default.llm_node(self, chat_ctx, tools, model_settings)

    @function_tool
    async def go_to_slide(self, context: RunContext[None], index: int, reason: str) -> str:
        """Show a specific slide. Call this before answering a question that another slide
        covers better, so the screen matches your answer. It does not present the slide.

        Args:
            index: Zero-based index of the slide to show.
            reason: What the user asked about, in five words or fewer, shown on screen,
                e.g. "return-to-play timing".
        """
        # Tools run while the preceding speech is still playing; switch only once it ends.
        await context.wait_for_playout()
        # An interruption also ends the playout: the user cut in, so stay on this slide.
        if context.speech_handle.interrupted:
            logger.info("go_to_slide %d skipped: speech was interrupted", index)
            return interrupted_tool_result(self._slides.index)
        try:
            await self._presentation.show(index, reason=reason)
        except SlideIndexError as exc:
            raise ToolError(str(exc)) from exc
        self._log.route_latest_turn(index)
        logger.info("showing slide %d: %s", index, reason)
        return jump_tool_result(self._deck.slides[index], self._slides.slide_count)

    @function_tool
    async def present_slide(self, context: RunContext[None], index: int) -> str | None:
        """Present a slide from its start. Call this when the user asks to go to or repeat a
        slide, asks to move on (the next slide), or agrees to hear a slide again. Say nothing
        else.

        Args:
            index: Zero-based index of the slide to present.
        """
        await context.wait_for_playout()
        if context.speech_handle.interrupted:
            logger.info("present_slide %d skipped: speech was interrupted", index)
            return interrupted_tool_result(self._slides.index)
        try:
            self._presentation.present(index)
        except SlideIndexError as exc:
            raise ToolError(str(exc)) from exc
        logger.info("presenting slide %d on request", index)
        # No tool reply: the scripted narration speaks next.
        return None

    @function_tool
    async def resume_presentation(self, context: RunContext[None]) -> str | None:
        """Continue the presentation from where it was interrupted. Call this when the user
        asks to continue, carry on or go on, or declines to hear a slide again. Say nothing
        else."""
        await context.wait_for_playout()
        if context.speech_handle.interrupted:
            logger.info("resume_presentation skipped: speech was interrupted")
            return interrupted_tool_result(self._slides.index)
        if not self._presentation.resume():
            return PRESENTATION_FINISHED_RESULT
        return None

    @function_tool
    async def flag_compliance(self, category: ComplianceCategory, question: str) -> str:
        """Record a compliance issue. Call this first, before replying, only when answering
        would need an individual clinical decision for the user, off-label use, a reported
        adverse event, or a clearly unrelated topic. General questions answered with a caveat
        are not compliance issues.

        Args:
            category: off_label, personal_medical_advice, adverse_event or out_of_scope.
            question: The user's message, close to verbatim.
        """
        flag = self._log.add_flag(category, question, self._slides.index)
        self._events.publish(flag)
        logger.info("compliance flag %s: %s", category, flag.id)
        return compliance_tool_result(category)
