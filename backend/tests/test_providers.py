import pytest
from google.genai import types as genai_types
from livekit.agents import NOT_GIVEN, APIStatusError, inference, llm, stt, tts
from livekit.plugins import deepgram, google
from pydantic import SecretStr

from synthio_backend.agent.providers import (
    TTS_SAMPLE_RATE,
    build_llm,
    build_stt,
    build_tts,
    build_turn_detector,
    describe_providers,
    google_thinking_config,
    llm_chain,
    stt_chain,
    tts_chain,
)
from synthio_backend.agent.report import llm_completer
from tests.conftest import make_settings

_LOCAL = {
    "turn_detector": "local:turn-detector-v1-mini",
    "interruption": "inference:adaptive (falls back to local VAD)",
}
_DEEPGRAM = SecretStr("dg-test-key")
_GOOGLE = SecretStr("google-test-key")


@pytest.fixture(autouse=True)
def _livekit_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    """LiveKit Inference clients read their credentials from the environment."""
    monkeypatch.setenv("LIVEKIT_API_KEY", "test-key")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "test-secret-that-is-long-enough-for-hs256")


def test_no_keys_uses_livekit_inference_unwrapped() -> None:
    settings = make_settings(deepgram_api_key=None, google_api_key=None)
    assert describe_providers(settings) == {
        "stt": "inference:deepgram/nova-3",
        "llm": "inference:google/gemini-2.5-flash",
        "tts": "inference:cartesia/sonic-3",
        **_LOCAL,
    }
    assert isinstance(build_stt(settings), inference.STT)
    assert isinstance(build_llm(settings), inference.LLM)
    assert isinstance(build_tts(settings), inference.TTS)


def test_blank_keys_count_as_unset() -> None:
    settings = make_settings(deepgram_api_key=SecretStr(" "), google_api_key=SecretStr(""))
    assert describe_providers(settings) == describe_providers(
        make_settings(deepgram_api_key=None, google_api_key=None)
    )
    assert len(stt_chain(settings)) == len(llm_chain(settings)) == len(tts_chain(settings)) == 1


def test_deepgram_only_chains_speech_before_inference() -> None:
    settings = make_settings(deepgram_api_key=_DEEPGRAM, google_api_key=None)
    assert describe_providers(settings) == {
        "stt": "deepgram:nova-3 -> inference:deepgram/nova-3",
        "llm": "inference:google/gemini-2.5-flash",
        "tts": "deepgram:aura-2-thalia-en -> inference:cartesia/sonic-3",
        **_LOCAL,
    }
    assert [type(s) for s in stt_chain(settings)] == [deepgram.STT, inference.STT]
    assert [type(t) for t in tts_chain(settings)] == [deepgram.TTS, inference.TTS]
    assert isinstance(build_stt(settings), stt.FallbackAdapter)
    assert isinstance(build_llm(settings), inference.LLM)
    speech = build_tts(settings)
    assert isinstance(speech, tts.FallbackAdapter)
    assert speech.sample_rate == TTS_SAMPLE_RATE
    assert all(t.sample_rate == TTS_SAMPLE_RATE for t in tts_chain(settings))


def test_google_only_chains_llm_before_inference() -> None:
    settings = make_settings(deepgram_api_key=None, google_api_key=_GOOGLE)
    assert describe_providers(settings) == {
        "stt": "inference:deepgram/nova-3",
        "llm": "google:gemini-3.5-flash -> inference:google/gemini-2.5-flash",
        "tts": "inference:cartesia/sonic-3",
        **_LOCAL,
    }
    assert [type(m) for m in llm_chain(settings)] == [google.LLM, inference.LLM]
    assert isinstance(build_llm(settings), llm.FallbackAdapter)
    assert isinstance(build_stt(settings), inference.STT)
    assert isinstance(build_tts(settings), inference.TTS)


def test_both_keys_chain_every_component() -> None:
    settings = make_settings(deepgram_api_key=_DEEPGRAM, google_api_key=_GOOGLE)
    described = describe_providers(settings)
    assert described == {
        "stt": "deepgram:nova-3 -> inference:deepgram/nova-3",
        "llm": "google:gemini-3.5-flash -> inference:google/gemini-2.5-flash",
        "tts": "deepgram:aura-2-thalia-en -> inference:cartesia/sonic-3",
        **_LOCAL,
    }
    assert isinstance(build_stt(settings), stt.FallbackAdapter)
    assert isinstance(build_llm(settings), llm.FallbackAdapter)
    assert isinstance(build_tts(settings), tts.FallbackAdapter)
    assert "dg-test-key" not in str(described)
    assert "google-test-key" not in str(described)


def test_turn_detector_runs_locally() -> None:
    detector = build_turn_detector()
    assert isinstance(detector, inference.TurnDetector)
    assert detector.model == "turn-detector-v1-mini"


class _FakeLLM:
    """Records report calls; fails with a 429 when ``text`` is None."""

    def __init__(self, label: str, text: str | None) -> None:
        self.label = label
        self.text = text
        self.response_formats: list[object] = []

    def chat(self, *, chat_ctx: llm.ChatContext, response_format: object, **_: object) -> "_Call":
        self.response_formats.append(response_format)
        return _Call(self.text)


class _Collected:
    def __init__(self, text: str) -> None:
        self.text = text


class _Call:
    def __init__(self, text: str | None) -> None:
        self._text = text

    async def collect(self) -> _Collected:
        if self._text is None:
            raise APIStatusError("quota exceeded", status_code=429)
        return _Collected(self._text)


async def test_report_completer_fails_over_with_response_format() -> None:
    primary, fallback = _FakeLLM("google", None), _FakeLLM("inference", '{"ok": 1}')
    complete = llm_completer([primary, fallback])  # type: ignore[list-item]
    assert await complete(llm.ChatContext.empty()) == '{"ok": 1}'
    assert primary.response_formats and fallback.response_formats
    assert primary.response_formats[0] is fallback.response_formats[0] is not None


async def test_report_completer_raises_when_every_llm_fails() -> None:
    complete = llm_completer([_FakeLLM("a", None), _FakeLLM("b", None)])  # type: ignore[list-item]
    with pytest.raises(APIStatusError):
        await complete(llm.ChatContext.empty())


def test_google_thinking_defaults_to_minimal() -> None:
    settings = make_settings(google_api_key=_GOOGLE)
    config = google_thinking_config(settings)
    assert isinstance(config, genai_types.ThinkingConfig)
    assert config.thinking_level == genai_types.ThinkingLevel.MINIMAL
    model = llm_chain(settings)[0]
    assert isinstance(model, google.LLM)
    assert model._opts.thinking_config == config


def test_google_thinking_level_is_configurable_or_off() -> None:
    low = make_settings(google_thinking_level="low")
    assert google_thinking_config(low) == genai_types.ThinkingConfig(
        thinking_level=genai_types.ThinkingLevel.LOW
    )
    assert google_thinking_config(make_settings(google_thinking_level="")) is NOT_GIVEN
    budget_model = make_settings(google_llm_model="gemini-2.5-flash")
    assert google_thinking_config(budget_model) is NOT_GIVEN
