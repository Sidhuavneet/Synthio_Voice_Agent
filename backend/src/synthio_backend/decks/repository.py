"""Loads and validates deck JSON files once, then serves them from memory."""

from collections.abc import Iterable
from pathlib import Path

from pydantic import ValidationError

from synthio_backend.decks.models import Deck, DeckSummary


class DeckNotFoundError(LookupError):
    def __init__(self, deck_id: str) -> None:
        super().__init__(f"Deck '{deck_id}' not found")
        self.deck_id = deck_id


class DeckLoadError(RuntimeError):
    """A deck file is missing, unreadable or invalid."""


class DeckRepository:
    def __init__(self, decks: Iterable[Deck]) -> None:
        self._decks: dict[str, Deck] = {}
        for deck in decks:
            if deck.id in self._decks:
                raise DeckLoadError(f"Duplicate deck id '{deck.id}'")
            self._decks[deck.id] = deck

    @classmethod
    def from_directory(cls, directory: Path) -> "DeckRepository":
        if not directory.is_dir():
            raise DeckLoadError(f"Deck directory not found: {directory}")
        return cls(_load_deck_file(path) for path in sorted(directory.glob("*.json")))

    def list_summaries(self) -> list[DeckSummary]:
        return [deck.summary() for deck in self._decks.values()]

    def get(self, deck_id: str) -> Deck:
        try:
            return self._decks[deck_id]
        except KeyError:
            raise DeckNotFoundError(deck_id) from None

    def first(self) -> Deck:
        try:
            return next(iter(self._decks.values()))
        except StopIteration:
            raise DeckLoadError("No decks available") from None


def _load_deck_file(path: Path) -> Deck:
    try:
        deck = Deck.model_validate_json(path.read_bytes())
    except (OSError, ValidationError) as exc:
        raise DeckLoadError(f"Invalid deck file {path.name}: {exc}") from exc
    if deck.id != path.stem:
        raise DeckLoadError(f"Deck id '{deck.id}' does not match filename '{path.name}'")
    return deck
