"""Per-component provider chains with runtime failover (see docs/CONTRACT.md section 2).

Each component has an ordered chain: the provider's own plugin first when its key is set,
LiveKit Inference last. A chain of more than one entry is wrapped in LiveKit's
``FallbackAdapter``, which moves to the next entry when one fails (a 429 or spent quota fails
over at once: no per-provider retries) and probes the failed one in the background until it
recovers. The turn detector always runs the local ``v1-mini`` model: the cloud ``v1`` detector
bills the LiveKit Inference quota, and a spent quota must not stall turn taking.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any, Final

from google.genai import types as genai_types
from livekit.agents import NOT_GIVEN, NotGivenOr, inference, llm, stt, tts
from livekit.plugins import deepgram, google

from synthio_backend.core.config import Settings, secret_value

ChatLLM = inference.LLM | google.LLM
"""LLMs used here; both accept ``response_format`` for the session report."""
SpeechToText = deepgram.STT | inference.STT
TextToSpeech = deepgram.TTS | inference.TTS

LOCAL_TURN_DETECTOR: Final[inference.TurnDetectorVersions] = "v1-mini"

# Both TTS providers synthesize at this rate, so failing over never resamples.
TTS_SAMPLE_RATE: Final = 24_000
# Per-attempt timeouts before moving to the next provider. Errors such as 429 fail over
# immediately; these bound a provider that hangs instead.
STT_ATTEMPT_TIMEOUT_S: Final = 5.0
LLM_ATTEMPT_TIMEOUT_S: Final = 10.0


@dataclass(frozen=True)
class _Option[T]:
    label: str
    build: Callable[[], T]


def _stt_options(settings: Settings) -> list[_Option[SpeechToText]]:
    options: list[_Option[SpeechToText]] = []
    key = secret_value(settings.deepgram_api_key)
    if key is not None:
        model = settings.deepgram_stt_model
        options.append(_Option(f"deepgram:{model}", lambda: deepgram.STT(model=model, api_key=key)))
    options.append(
        _Option(
            f"inference:{settings.stt_model}",
            lambda: inference.STT.from_model_string(settings.stt_model),
        )
    )
    return options


def google_thinking_config(
    settings: Settings, model: str | None = None
) -> NotGivenOr[genai_types.ThinkingConfig]:
    """The configured thinking level, for Gemini 3+ models (which take a level rather than a
    token budget); not given otherwise, leaving the model's default."""
    level = settings.google_thinking_level
    name = (model or settings.google_llm_model).lower()
    if not level or not any(family in name for family in ("gemini-3", "gemini-4")):
        return NOT_GIVEN
    return genai_types.ThinkingConfig(thinking_level=genai_types.ThinkingLevel(level.upper()))


def google_models(settings: Settings) -> list[str]:
    """The primary Gemini model, then the fallback models, without blanks or repeats."""
    names = [settings.google_llm_model, *settings.google_llm_fallback_models.split(",")]
    return list(dict.fromkeys(name.strip() for name in names if name.strip()))


def _google_option(model: str, key: str, settings: Settings) -> _Option[ChatLLM]:
    thinking = google_thinking_config(settings, model)
    return _Option(
        f"google:{model}",
        lambda: google.LLM(model=model, api_key=key, thinking_config=thinking),
    )


def _llm_options(settings: Settings) -> list[_Option[ChatLLM]]:
    options: list[_Option[ChatLLM]] = []
    key = secret_value(settings.google_api_key)
    if key is not None:
        options.extend(_google_option(model, key, settings) for model in google_models(settings))
    options.append(
        _Option(f"inference:{settings.llm_model}", lambda: inference.LLM(model=settings.llm_model))
    )
    return options


def _tts_options(settings: Settings) -> list[_Option[TextToSpeech]]:
    options: list[_Option[TextToSpeech]] = []
    key = secret_value(settings.deepgram_api_key)
    if key is not None:
        model = settings.deepgram_tts_model
        options.append(
            _Option(
                f"deepgram:{model}",
                lambda: deepgram.TTS(model=model, api_key=key, sample_rate=TTS_SAMPLE_RATE),
            )
        )
    options.append(
        _Option(
            f"inference:{settings.tts_model}",
            lambda: inference.TTS(
                model=settings.tts_model,
                voice=settings.tts_voice or NOT_GIVEN,
                sample_rate=TTS_SAMPLE_RATE,
            ),
        )
    )
    return options


def stt_chain(settings: Settings) -> list[SpeechToText]:
    return [option.build() for option in _stt_options(settings)]


def llm_chain(settings: Settings) -> list[ChatLLM]:
    return [option.build() for option in _llm_options(settings)]


def tts_chain(settings: Settings) -> list[TextToSpeech]:
    return [option.build() for option in _tts_options(settings)]


def with_stt_fallback(chain: Sequence[SpeechToText]) -> stt.STT[Any]:
    if len(chain) == 1:
        return chain[0]
    # Every member streams, so no VAD is needed for a StreamAdapter.
    return stt.FallbackAdapter(
        list(chain), attempt_timeout=STT_ATTEMPT_TIMEOUT_S, max_retry_per_stt=0
    )


def with_llm_fallback(chain: Sequence[ChatLLM]) -> llm.LLM[Any]:
    if len(chain) == 1:
        return chain[0]
    return llm.FallbackAdapter(
        list(chain), attempt_timeout=LLM_ATTEMPT_TIMEOUT_S, max_retry_per_llm=0
    )


def with_tts_fallback(chain: Sequence[TextToSpeech]) -> tts.TTS[Any]:
    if len(chain) == 1:
        return chain[0]
    return tts.FallbackAdapter(list(chain), max_retry_per_tts=0, sample_rate=TTS_SAMPLE_RATE)


def build_stt(settings: Settings) -> stt.STT[Any]:
    return with_stt_fallback(stt_chain(settings))


def build_llm(settings: Settings) -> llm.LLM[Any]:
    return with_llm_fallback(llm_chain(settings))


def build_tts(settings: Settings) -> tts.TTS[Any]:
    return with_tts_fallback(tts_chain(settings))


def build_turn_detector() -> inference.TurnDetector:
    return inference.TurnDetector(version=LOCAL_TURN_DETECTOR)


def _describe[T](options: Sequence[_Option[T]]) -> str:
    return " -> ".join(option.label for option in options)


def describe_providers(settings: Settings) -> dict[str, str]:
    """Provider chain per component in failover order, for logs (never includes keys)."""
    return {
        "stt": _describe(_stt_options(settings)),
        "llm": _describe(_llm_options(settings)),
        "tts": _describe(_tts_options(settings)),
        "turn_detector": f"local:turn-detector-{LOCAL_TURN_DETECTOR}",
        "interruption": "inference:adaptive (falls back to local VAD)",
    }
