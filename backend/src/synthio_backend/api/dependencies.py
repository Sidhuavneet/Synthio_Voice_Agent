"""Request-scoped accessors for state built once in ``create_app``."""

from typing import Annotated

from fastapi import Depends, Request

from synthio_backend.core.config import Settings
from synthio_backend.decks.repository import DeckRepository


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_deck_repository(request: Request) -> DeckRepository:
    repository: DeckRepository = request.app.state.deck_repository
    return repository


AppSettings = Annotated[Settings, Depends(get_app_settings)]
Repository = Annotated[DeckRepository, Depends(get_deck_repository)]
