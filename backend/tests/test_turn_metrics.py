from livekit.agents.metrics import EOUMetrics, LLMMetrics, STTMetrics, TTSMetrics

from synthio_backend.agent.turn_metrics import TurnMetricsAggregator


def _eou(speech_id: str, eou: float = 0.4, transcription: float = 0.2) -> EOUMetrics:
    return EOUMetrics(
        timestamp=0,
        end_of_utterance_delay=eou,
        transcription_delay=transcription,
        on_user_turn_completed_delay=0,
        speech_id=speech_id,
    )


def _llm(speech_id: str | None, ttft: float = 0.3) -> LLMMetrics:
    return LLMMetrics(
        label="llm",
        request_id="r",
        timestamp=0,
        duration=1,
        ttft=ttft,
        cancelled=False,
        completion_tokens=1,
        prompt_tokens=1,
        prompt_cached_tokens=0,
        total_tokens=2,
        tokens_per_second=1,
        speech_id=speech_id,
    )


def _tts(speech_id: str, ttfb: float = 0.25) -> TTSMetrics:
    return TTSMetrics(
        label="tts",
        request_id="r",
        timestamp=0,
        ttfb=ttfb,
        duration=1,
        audio_duration=1,
        cancelled=False,
        characters_count=10,
        streamed=True,
        speech_id=speech_id,
    )


def test_user_turn_emits_once_with_total() -> None:
    aggregator = TurnMetricsAggregator()
    assert aggregator.add(_eou("s1")) is None
    assert aggregator.add(_llm("s1", ttft=-1)) is None  # tool-call step with no tokens
    assert aggregator.add(_llm("s1", ttft=0.3)) is None
    assert aggregator.add(_llm("s1", ttft=0.9)) is None  # later step: first TTFT is kept
    event = aggregator.add(_tts("s1"))
    assert event is not None
    assert event.model_dump(by_alias=True) == {
        "type": "turn_metrics",
        "turnId": "s1",
        "sttMs": 200,
        "eouMs": 400,
        "llmTtftMs": 300,
        "ttsTtfbMs": 250,
        "totalMs": 950,
    }
    assert aggregator.add(_tts("s1")) is None  # second segment of the same reply


def test_agent_initiated_turn_has_no_total() -> None:
    aggregator = TurnMetricsAggregator()
    aggregator.add(_llm("s2"))
    event = aggregator.add(_tts("s2"))
    assert event is not None
    assert (event.eou_ms, event.stt_ms, event.total_ms) == (None, None, None)
    assert event.llm_ttft_ms == 300


def test_ignores_unrelated_and_unattributed_metrics() -> None:
    aggregator = TurnMetricsAggregator()
    stt = STTMetrics(
        label="stt", request_id="r", timestamp=0, duration=0, audio_duration=1, streamed=True
    )
    assert aggregator.add(stt) is None
    assert aggregator.add(_llm(None)) is None


def test_turns_are_tracked_independently() -> None:
    aggregator = TurnMetricsAggregator()
    aggregator.add(_eou("a", eou=0.1))
    aggregator.add(_eou("b", eou=0.2))
    aggregator.add(_llm("b"))
    event = aggregator.add(_tts("b"))
    assert event is not None
    assert (event.turn_id, event.eou_ms) == ("b", 200)
