"""Pydantic models for slide decks. JSON keys are camelCase on the wire."""

from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

MIN_SLIDES = 5
MAX_SLIDES = 6
MIN_POINTS = 2
MAX_POINTS = 4
MAX_INTRO_WORDS = 20
MAX_POINT_TEXT_CHARS = 70
MAX_POINT_DETAIL_CHARS = 160
MIN_NARRATION_WORDS = 20
MAX_NARRATION_WORDS = 45

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
DeckId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")]


def _word_count_between(minimum: int, maximum: int) -> AfterValidator:
    def check(text: str) -> str:
        words = len(text.split())
        if not minimum <= words <= maximum:
            raise ValueError(f"must be {minimum} to {maximum} words, got {words}")
        return text

    return AfterValidator(check)


IntroText = Annotated[NonEmptyStr, _word_count_between(1, MAX_INTRO_WORDS)]
NarrationText = Annotated[
    NonEmptyStr, _word_count_between(MIN_NARRATION_WORDS, MAX_NARRATION_WORDS)
]


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


class Point(CamelModel):
    text: Annotated[NonEmptyStr, StringConstraints(max_length=MAX_POINT_TEXT_CHARS)]
    """Short on-screen bullet."""
    detail: Annotated[NonEmptyStr, StringConstraints(max_length=MAX_POINT_DETAIL_CHARS)]
    """Very short paragraph shown under the bullet."""
    narration: NarrationText
    """What the agent says for this point, verbatim."""


class Slide(CamelModel):
    index: int = Field(ge=0)
    title: NonEmptyStr
    kicker: NonEmptyStr
    intro: IntroText
    """Spoken lead-in sentence for the slide."""
    points: list[Point] = Field(min_length=MIN_POINTS, max_length=MAX_POINTS)
    """Shown in order and narrated in the same order."""
    stat: SlideStat | None = None
    keywords: list[NonEmptyStr] = Field(default_factory=list)
    source_ids: list[int] = Field(default_factory=list)


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

    @model_validator(mode="after")
    def _check_source_ids(self) -> Self:
        for slide in self.slides:
            invalid = [i for i in slide.source_ids if not 0 <= i < len(self.sources)]
            if invalid:
                raise ValueError(
                    f"slide {slide.index} sourceIds {invalid} are outside deck.sources "
                    f"(0 to {len(self.sources) - 1})"
                )
        return self

    def summary(self) -> DeckSummary:
        return DeckSummary(
            id=self.id,
            title=self.title,
            subtitle=self.subtitle,
            category=self.category,
            slide_count=len(self.slides),
        )
