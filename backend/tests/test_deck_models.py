from typing import Any

import pytest
from pydantic import ValidationError

from synthio_backend.decks.models import Deck


def test_valid_deck_parses_camel_case(deck: Deck) -> None:
    assert deck.id == "sample-deck"
    assert deck.slides[0].intro.startswith("Intro for")
    assert deck.slides[0].points[1].text == "Why it matters point two"
    assert deck.slides[1].stat is None


def test_deck_serialises_with_camel_case_keys(deck: Deck) -> None:
    dumped = deck.model_dump(by_alias=True)
    assert set(dumped["slides"][0]["points"][0]) == {"text", "detail", "narration"}
    assert "sourceIds" in dumped["slides"][0]
    assert deck.summary().model_dump(by_alias=True)["slideCount"] == 5


@pytest.mark.parametrize("count", [4, 7])
def test_rejects_wrong_slide_count(deck_data: dict[str, Any], count: int) -> None:
    template = deck_data["slides"][0]
    deck_data["slides"] = [{**template, "index": i} for i in range(count)]
    with pytest.raises(ValidationError, match="slides"):
        Deck.model_validate(deck_data)


def test_rejects_non_contiguous_indices(deck_data: dict[str, Any]) -> None:
    deck_data["slides"][4]["index"] = 7
    with pytest.raises(ValidationError, match="contiguous"):
        Deck.model_validate(deck_data)


def test_rejects_out_of_order_indices(deck_data: dict[str, Any]) -> None:
    slides = deck_data["slides"]
    slides[0]["index"], slides[1]["index"] = 1, 0
    with pytest.raises(ValidationError, match="contiguous"):
        Deck.model_validate(deck_data)


@pytest.mark.parametrize("count", [1, 5])
def test_rejects_point_count(deck_data: dict[str, Any], count: int) -> None:
    point = deck_data["slides"][0]["points"][0]
    deck_data["slides"][0]["points"] = [point] * count
    with pytest.raises(ValidationError, match="points"):
        Deck.model_validate(deck_data)


_WORDS_19 = " ".join(["word"] * 19)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("text", "x" * 71),
        ("detail", "x" * 161),
        ("narration", _WORDS_19),
        ("narration", " ".join(["word"] * 46)),
        ("narration", "   "),
    ],
)
def test_rejects_point_limits(deck_data: dict[str, Any], field: str, value: str) -> None:
    deck_data["slides"][0]["points"][0][field] = value
    with pytest.raises(ValidationError, match=field):
        Deck.model_validate(deck_data)


def test_rejects_long_intro(deck_data: dict[str, Any]) -> None:
    deck_data["slides"][0]["intro"] = " ".join(["word"] * 21)
    with pytest.raises(ValidationError, match="intro"):
        Deck.model_validate(deck_data)


def test_rejects_v1_slide_fields(deck_data: dict[str, Any]) -> None:
    deck_data["slides"][0]["speakerNotes"] = "v1 field"
    with pytest.raises(ValidationError, match="speakerNotes"):
        Deck.model_validate(deck_data)


def test_rejects_missing_field(deck_data: dict[str, Any]) -> None:
    del deck_data["presenter"]
    with pytest.raises(ValidationError, match="presenter"):
        Deck.model_validate(deck_data)


def test_rejects_unknown_field(deck_data: dict[str, Any]) -> None:
    deck_data["slides"][0]["notes"] = "typo of intro"
    with pytest.raises(ValidationError):
        Deck.model_validate(deck_data)


def test_rejects_invalid_id(deck_data: dict[str, Any]) -> None:
    deck_data["id"] = "Not A Slug"
    with pytest.raises(ValidationError):
        Deck.model_validate(deck_data)


def test_source_ids_default_to_empty(deck: Deck) -> None:
    assert deck.slides[0].source_ids == []


def test_accepts_source_ids_in_range(deck_data: dict[str, Any]) -> None:
    deck_data["slides"][0]["sourceIds"] = [0]
    assert Deck.model_validate(deck_data).slides[0].source_ids == [0]


@pytest.mark.parametrize("source_id", [-1, 1])
def test_rejects_source_ids_out_of_range(deck_data: dict[str, Any], source_id: int) -> None:
    deck_data["slides"][2]["sourceIds"] = [source_id]
    with pytest.raises(ValidationError, match="sourceIds"):
        Deck.model_validate(deck_data)
