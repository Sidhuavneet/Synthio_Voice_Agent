"""Chooses the deck for a job from its dispatch metadata."""

import json
import logging

from synthio_backend.decks.models import Deck
from synthio_backend.decks.repository import DeckNotFoundError, DeckRepository

logger = logging.getLogger(__name__)


def _deck_id_from_metadata(metadata: str) -> str | None:
    try:
        data = json.loads(metadata) if metadata else None
    except json.JSONDecodeError:
        return None
    deck_id = data.get("deckId") if isinstance(data, dict) else None
    return deck_id if isinstance(deck_id, str) else None


def select_deck(repository: DeckRepository, metadata: str) -> Deck:
    """Returns the deck named in the metadata, falling back to the first deck."""
    deck_id = _deck_id_from_metadata(metadata)
    if deck_id is not None:
        try:
            return repository.get(deck_id)
        except DeckNotFoundError:
            logger.warning("unknown deckId %r in job metadata, using default deck", deck_id)
    else:
        logger.warning("no valid deckId in job metadata, using default deck")
    return repository.first()
