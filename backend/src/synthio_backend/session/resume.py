"""Saved progress a session can resume from (see docs/CONTRACT.md sections 4 and 5)."""

from pydantic import Field

from synthio_backend.decks.models import CamelModel


class ResumeState(CamelModel):
    slide_index: int = Field(ge=0)
    """Slide the presentation picks up at."""
    presented: list[int] = Field(default_factory=list)
    """Slides already fully presented."""

    def check_slide_count(self, slide_count: int) -> None:
        """Raises ValueError when an index is outside a deck of ``slide_count`` slides."""
        invalid = [i for i in (self.slide_index, *self.presented) if not 0 <= i < slide_count]
        if invalid:
            raise ValueError(
                f"resume indices {invalid} are outside the deck (0 to {slide_count - 1})"
            )
