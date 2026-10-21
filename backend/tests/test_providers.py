from livekit.agents import inference
from livekit.plugins import deepgram, google
from pydantic import SecretStr

from synthio_backend.agent.providers import (
    build_llm,
    build_stt,
    build_tts,
    build_turn_detector,
    describe_providers,
)
from tests.conftest import make_settings


def test_defaults_to_livekit_inference() -> None:
    settings = make_settings(deepgram_api_key=None, google_api_key=None)
    assert describe_providers(settings) == {
        "stt": "inference:deepgram/nova-3",
        "llm": "inference:google/gemini-2.5-flash",
        "tts": "inference:cartesia/sonic-3",
        "turn_detector": "local:turn-detector-v1-mini",
        "interruption": "inference:adaptive (falls back to local VAD)",
    }


def test_blank_keys_count_as_unset() -> None:
    settings = make_settings(deepgram_api_key=SecretStr(" "), google_api_key=SecretStr(""))
    assert all(
        v.startswith(("inference:", "local:")) for v in describe_providers(settings).values()
    )


def test_own_keys_select_plugins_per_component() -> None:
    settings = make_settings(
        deepgram_api_key=SecretStr("dg-test-key"), google_api_key=SecretStr("google-test-key")
    )
    assert describe_providers(settings) == {
        "stt": "deepgram:nova-3",
        "llm": "google:gemini-2.5-flash",
        "tts": "deepgram:aura-2-thalia-en",
        "turn_detector": "local:turn-detector-v1-mini",
        "interruption": "inference:adaptive (falls back to local VAD)",
    }
    assert isinstance(build_stt(settings), deepgram.STT)
    assert isinstance(build_tts(settings), deepgram.TTS)
    assert isinstance(build_llm(settings), google.LLM)
    assert "dg-test-key" not in str(describe_providers(settings))


def test_turn_detector_runs_locally() -> None:
    detector = build_turn_detector()
    assert isinstance(detector, inference.TurnDetector)
    assert detector.model == "turn-detector-v1-mini"
