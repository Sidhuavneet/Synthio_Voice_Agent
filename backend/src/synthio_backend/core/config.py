"""Application settings from the environment, ``backend/.env`` and ``backend/.env.local``."""

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import SecretStr
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

    frontend_origins: str = "http://localhost:3000"
    agent_name: str = "synthio-presenter"

    stt_model: str = "deepgram/nova-3"
    llm_model: str = "google/gemini-2.5-flash"
    tts_model: str = "cartesia/sonic-3"
    tts_voice: str | None = None

    decks_dir: Path = DEFAULT_DECKS_DIR

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def load_env_files() -> None:
    """Exports the env files to the process environment, where the LiveKit CLI and
    Inference clients read LIVEKIT_*. Existing variables are never overridden, so the
    higher-precedence file is loaded first."""
    for env_file in reversed(ENV_FILES):
        load_dotenv(env_file)
