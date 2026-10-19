from fastapi import APIRouter

from synthio_backend.api.dependencies import Repository
from synthio_backend.decks.models import Deck, DeckSummary

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("")
def list_decks(repository: Repository) -> list[DeckSummary]:
    return repository.list_summaries()


@router.get("/{deck_id}")
def get_deck(deck_id: str, repository: Repository) -> Deck:
    return repository.get(deck_id)
