"""Application settings from the environment, ``backend/.env`` and ``backend/.env.local``."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[3]
# Later files take precedence, so .env.local overrides .env.
ENV_FILES = (BACKEND_ROOT / ".env", BACKEND_ROOT / ".env.local")
DEFAULT_DECKS_DIR = Path(__file__).resolve().parents[1] / "decks" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    livekit_url: str | None = None
    livekit_api_key: str | None = None
    livekit_api_secret: SecretStr | None = None

    api_host: str = "127.0.0.1"
    api_port: int = 8500

    # Comma-separated exact origins (e.g. the Vercel production URL), plus an optional regex
    # for preview deploys such as ``https://.*\.vercel\.app``.
    frontend_origins: str = "http://localhost:3000"
    frontend_origin_regex: str | None = None
    agent_name: str = "synthio-presenter"
    # Hosted free tiers sleep when idle (see session/warmup.py). The API dispatches a warm-up
    # job to the agent this often (0 = off), and the agent pings ``self_ping_url`` (the API's
    # health URL) every ``self_ping_interval_s`` (no URL = off), so each keeps the other awake.
    agent_warmup_interval_s: float = Field(default=3600.0, ge=0)
    self_ping_url: str | None = None
    self_ping_interval_s: float = Field(default=600.0, gt=0)

    stt_model: str = "deepgram/nova-3"
    llm_model: str = "google/gemini-2.5-flash"
    tts_model: str = "cartesia/sonic-3"
    tts_voice: str | None = None

    # Own provider keys: when set, that component uses the provider's plugin directly instead
    # of LiveKit Inference (see docs/CONTRACT.md section 2).
    deepgram_api_key: SecretStr | None = None
    deepgram_stt_model: str = "nova-3"
    deepgram_tts_model: str = "aura-2-thalia-en"
    google_api_key: SecretStr | None = None
    google_llm_model: str = "gemini-3.5-flash"
    # Tried in order after google_llm_model. Free-tier Gemini quotas are per model, so each
    # extra model adds its own daily allowance before falling back to LiveKit Inference.
    google_llm_fallback_models: str = "gemini-3-flash-preview,gemini-3.1-flash-lite-preview"
    # Gemini 3+ thinking level; minimal keeps voice latency low. Blank sends no thinking
    # config. Ignored for models that take a token budget instead.
    google_thinking_level: Literal["", "minimal", "low", "medium", "high"] = "minimal"

    decks_dir: Path = DEFAULT_DECKS_DIR

    @property
    def cors_origins(self) -> list[str]:
        # Browsers send origins without a trailing slash, so a pasted "https://x.app/" matches.
        origins = (origin.strip().rstrip("/") for origin in self.frontend_origins.split(","))
        return [origin for origin in origins if origin]

    @property
    def cors_origin_regex(self) -> str | None:
        pattern = (self.frontend_origin_regex or "").strip()
        return pattern or None


def secret_value(secret: SecretStr | None) -> str | None:
    """The secret, or None when unset or blank (e.g. ``KEY=`` in an env file)."""
    value = secret.get_secret_value().strip() if secret is not None else ""
    return value or None


@lru_cache
def get_settings() -> Settings:
    return Settings()


def load_env_files() -> None:
    """Exports the env files to the process environment, where the LiveKit CLI and
    Inference clients read LIVEKIT_*. Existing variables are never overridden, so the
    higher-precedence file is loaded first."""
    for env_file in reversed(ENV_FILES):
        load_dotenv(env_file)
