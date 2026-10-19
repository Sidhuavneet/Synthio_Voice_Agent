import json
from pathlib import Path
from typing import Any

import pytest

from synthio_backend.decks.repository import DeckLoadError, DeckNotFoundError, DeckRepository


def test_lists_and_gets_decks(repository: DeckRepository) -> None:
    assert [summary.id for summary in repository.list_summaries()] == ["sample-deck"]
    assert repository.get("sample-deck").title == "Sample Deck"
    assert repository.first().id == "sample-deck"


def test_get_unknown_raises(repository: DeckRepository) -> None:
    with pytest.raises(DeckNotFoundError):
        repository.get("missing")


def test_id_must_match_filename(tmp_path: Path, deck_data: dict[str, Any]) -> None:
    (tmp_path / "other-name.json").write_text(json.dumps(deck_data))
    with pytest.raises(DeckLoadError, match="does not match filename"):
        DeckRepository.from_directory(tmp_path)


def test_invalid_file_raises(tmp_path: Path) -> None:
    (tmp_path / "broken.json").write_text("{not json")
    with pytest.raises(DeckLoadError, match=r"broken\.json"):
        DeckRepository.from_directory(tmp_path)


def test_missing_directory_raises(tmp_path: Path) -> None:
    with pytest.raises(DeckLoadError, match="not found"):
        DeckRepository.from_directory(tmp_path / "nope")


def test_first_on_empty_repository_raises(tmp_path: Path) -> None:
    with pytest.raises(DeckLoadError, match="No decks"):
        DeckRepository.from_directory(tmp_path).first()
