"""Pydantic models for slide decks. JSON keys are camelCase on the wire."""

from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

MIN_SLIDES = 5
MAX_SLIDES = 6

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
DeckId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


class Presenter(CamelModel):
    name: NonEmptyStr
    role: NonEmptyStr


class SlideStat(CamelModel):
    value: NonEmptyStr
    label: NonEmptyStr


class Slide(CamelModel):
    index: int = Field(ge=0)
    title: NonEmptyStr
    kicker: NonEmptyStr
    bullets: list[NonEmptyStr] = Field(min_length=2, max_length=4)
    stat: SlideStat | None = None
    speaker_notes: NonEmptyStr
    keywords: list[NonEmptyStr] = Field(default_factory=list)


class DeckSummary(CamelModel):
    id: DeckId
    title: NonEmptyStr
    subtitle: NonEmptyStr
    category: NonEmptyStr
    slide_count: int


class Deck(CamelModel):
    id: DeckId
    title: NonEmptyStr
    subtitle: NonEmptyStr
    category: NonEmptyStr
    audience: NonEmptyStr
    presenter: Presenter
    disclaimer: NonEmptyStr
    slides: list[Slide] = Field(min_length=MIN_SLIDES, max_length=MAX_SLIDES)
    sources: list[NonEmptyStr] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_slide_indices(self) -> Self:
        indices = [slide.index for slide in self.slides]
        if indices != list(range(len(self.slides))):
            raise ValueError(f"slide indices must be contiguous from 0 in order, got {indices}")
        return self

    def summary(self) -> DeckSummary:
        return DeckSummary(
            id=self.id,
            title=self.title,
            subtitle=self.subtitle,
            category=self.category,
            slide_count=len(self.slides),
        )
