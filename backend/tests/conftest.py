import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from synthio_backend.api.main import create_app
from synthio_backend.core.config import Settings
from synthio_backend.decks.models import Deck
from synthio_backend.decks.repository import DeckRepository

FIXTURE_DECKS_DIR = Path(__file__).parent / "fixtures" / "decks"
SAMPLE_DECK_ID = "sample-deck"


@pytest.fixture
def deck_data() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURE_DECKS_DIR / f"{SAMPLE_DECK_ID}.json").read_text())
    return data


@pytest.fixture
def deck(deck_data: dict[str, Any]) -> Deck:
    return Deck.model_validate(deck_data)


@pytest.fixture
def repository() -> DeckRepository:
    return DeckRepository.from_directory(FIXTURE_DECKS_DIR)


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "livekit_url": "wss://test.livekit.cloud",
        "livekit_api_key": "test-key",
        "livekit_api_secret": SecretStr("test-secret-that-is-long-enough-for-hs256"),
        "decks_dir": FIXTURE_DECKS_DIR,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


def _client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as client:
        yield client


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    yield from _client(settings)


@pytest.fixture
def unconfigured_client() -> Iterator[TestClient]:
    yield from _client(
        make_settings(livekit_url=None, livekit_api_key=None, livekit_api_secret=None)
    )
