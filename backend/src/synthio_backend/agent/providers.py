"""Per-component provider selection (see docs/CONTRACT.md section 2).

A component uses its provider's plugin directly when that provider's key is set, otherwise
LiveKit Inference. The turn detector always runs the local ``v1-mini`` model: the cloud
``v1`` detector bills the LiveKit Inference quota, and a spent quota must not stall turn
taking.
"""

from typing import Final

from livekit.agents import NOT_GIVEN, inference
from livekit.plugins import deepgram, google

from synthio_backend.core.config import Settings, secret_value

ChatLLM = inference.LLM | google.LLM
"""LLMs used here; both accept ``response_format`` for the session report."""
SpeechToText = deepgram.STT | inference.STT
TextToSpeech = deepgram.TTS | inference.TTS

LOCAL_TURN_DETECTOR: Final[inference.TurnDetectorVersions] = "v1-mini"


def build_stt(settings: Settings) -> SpeechToText:
    key = secret_value(settings.deepgram_api_key)
    if key is not None:
        return deepgram.STT(model=settings.deepgram_stt_model, api_key=key)
    return inference.STT.from_model_string(settings.stt_model)


def build_llm(settings: Settings) -> ChatLLM:
    key = secret_value(settings.google_api_key)
    if key is not None:
        return google.LLM(model=settings.google_llm_model, api_key=key)
    return inference.LLM(model=settings.llm_model)


def build_tts(settings: Settings) -> TextToSpeech:
    key = secret_value(settings.deepgram_api_key)
    if key is not None:
        return deepgram.TTS(model=settings.deepgram_tts_model, api_key=key)
    return inference.TTS(model=settings.tts_model, voice=settings.tts_voice or NOT_GIVEN)


def build_turn_detector() -> inference.TurnDetector:
    return inference.TurnDetector(version=LOCAL_TURN_DETECTOR)


def describe_providers(settings: Settings) -> dict[str, str]:
    """Resolved provider per component, for logs (never includes keys)."""
    deepgram_key = secret_value(settings.deepgram_api_key) is not None
    google_key = secret_value(settings.google_api_key) is not None
    return {
        "stt": f"deepgram:{settings.deepgram_stt_model}"
        if deepgram_key
        else f"inference:{settings.stt_model}",
        "llm": f"google:{settings.google_llm_model}"
        if google_key
        else f"inference:{settings.llm_model}",
        "tts": f"deepgram:{settings.deepgram_tts_model}"
        if deepgram_key
        else f"inference:{settings.tts_model}",
        "turn_detector": f"local:turn-detector-{LOCAL_TURN_DETECTOR}",
        "interruption": "inference:adaptive (falls back to local VAD)",
    }
