"""Assembles per-turn latency from LiveKit metrics, grouped by speech id."""

from collections import OrderedDict
from dataclasses import dataclass

from livekit.agents.metrics import AgentMetrics, EOUMetrics, LLMMetrics, TTSMetrics

from synthio_backend.agent.events import TurnMetricsEvent

# Speeches that never produce audio (e.g. interrupted before the first frame) are evicted
# oldest-first once this many are being tracked.
_MAX_TRACKED_TURNS = 32


@dataclass
class _Turn:
    stt_s: float | None = None
    eou_s: float | None = None
    llm_ttft_s: float | None = None
    tts_ttfb_s: float | None = None
    emitted: bool = False


def _ms(seconds: float | None) -> int | None:
    return None if seconds is None else round(seconds * 1000)


class TurnMetricsAggregator:
    """Feed every metrics event to ``add``; it returns a turn once its first audio is ready.

    A turn is one agent reply (speech handle). User turns contribute end-of-utterance and
    transcription delays (streaming STT reports no per-request latency, so the transcription
    delay after end of speech is the STT figure); the first LLM time-to-first-token and the
    first TTS time-to-first-byte are what the user waits for, even across tool-call steps.
    """

    def __init__(self) -> None:
        self._turns: OrderedDict[str, _Turn] = OrderedDict()

    def add(self, metrics: AgentMetrics) -> TurnMetricsEvent | None:
        if not isinstance(metrics, EOUMetrics | LLMMetrics | TTSMetrics):
            return None
        if metrics.speech_id is None:
            return None
        turn = self._turn(metrics.speech_id)
        if isinstance(metrics, EOUMetrics):
            turn.eou_s = metrics.end_of_utterance_delay
            turn.stt_s = metrics.transcription_delay
        elif isinstance(metrics, LLMMetrics):
            # ttft is -1 when the response produced no tokens.
            if turn.llm_ttft_s is None and metrics.ttft >= 0:
                turn.llm_ttft_s = metrics.ttft
        elif not turn.emitted and metrics.ttfb >= 0:
            turn.tts_ttfb_s = metrics.ttfb
            turn.emitted = True
            # Scripted narration and agent-initiated replies have no end of utterance: they
            # are not replies the user waited for, and emitting them would replace the last
            # answer's latency with an empty row.
            if turn.eou_s is None:
                return None
            return self._event(metrics.speech_id, turn)
        return None

    def _turn(self, speech_id: str) -> _Turn:
        turn = self._turns.get(speech_id)
        if turn is None:
            turn = self._turns[speech_id] = _Turn()
            if len(self._turns) > _MAX_TRACKED_TURNS:
                self._turns.popitem(last=False)
        return turn

    @staticmethod
    def _event(speech_id: str, turn: _Turn) -> TurnMetricsEvent:
        total = None
        # Only user-initiated replies have an end-of-utterance delay.
        if turn.eou_s is not None and turn.llm_ttft_s is not None and turn.tts_ttfb_s is not None:
            total = turn.eou_s + turn.llm_ttft_s + turn.tts_ttfb_s
        return TurnMetricsEvent(
            turn_id=speech_id,
            stt_ms=_ms(turn.stt_s),
            eou_ms=_ms(turn.eou_s),
            llm_ttft_ms=_ms(turn.llm_ttft_s),
            tts_ttfb_ms=_ms(turn.tts_ttfb_s),
            total_ms=_ms(total),
        )
