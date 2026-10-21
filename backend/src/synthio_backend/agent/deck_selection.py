"""Reads the deck and resume state for a job from its dispatch metadata."""

import json
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from synthio_backend.decks.models import Deck
from synthio_backend.decks.repository import DeckNotFoundError, DeckRepository
from synthio_backend.session.resume import ResumeState

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class JobSelection:
    deck: Deck
    resume: ResumeState | None


def _parse(metadata: str) -> dict[str, Any]:
    try:
        data = json.loads(metadata) if metadata else None
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _select_deck(repository: DeckRepository, deck_id: object) -> Deck:
    if isinstance(deck_id, str):
        try:
            return repository.get(deck_id)
        except DeckNotFoundError:
            logger.warning("unknown deckId %r in job metadata, using default deck", deck_id)
    else:
        logger.warning("no valid deckId in job metadata, using default deck")
    return repository.first()


def _select_resume(deck: Deck, raw: object) -> ResumeState | None:
    if raw is None:
        return None
    try:
        resume = ResumeState.model_validate(raw)
        resume.check_slide_count(len(deck.slides))
    except (ValidationError, ValueError) as exc:
        logger.warning("ignoring invalid resume state in job metadata: %s", exc)
        return None
    return resume


def select_job(repository: DeckRepository, metadata: str) -> JobSelection:
    """Returns the deck named in the metadata (falling back to the first deck) and the resume
    state, which is dropped when it does not fit that deck."""
    data = _parse(metadata)
    deck = _select_deck(repository, data.get("deckId"))
    resume = _select_resume(deck, data.get("resume")) if deck.id == data.get("deckId") else None
    return JobSelection(deck=deck, resume=resume)
