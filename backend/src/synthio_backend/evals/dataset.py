"""Eval cases: ``backend/evals/<deckId>.jsonl`` (see docs/CONTRACT.md section 8)."""

from pathlib import Path

from pydantic import Field, ValidationError

from synthio_backend.agent.events import ComplianceCategory
from synthio_backend.core.config import BACKEND_ROOT
from synthio_backend.decks.models import CamelModel, NonEmptyStr

EVALS_DIR = BACKEND_ROOT / "evals"
RESULTS_DIR = EVALS_DIR / "results"


class EvalCase(CamelModel):
    user_input: NonEmptyStr = Field(alias="input")
    expect_slide: int | None
    expect_flag: ComplianceCategory | None


class DatasetError(ValueError):
    """The dataset file is missing or has an invalid line."""


def dataset_path(deck_id: str) -> Path:
    return EVALS_DIR / f"{deck_id}.jsonl"


def results_path(deck_id: str) -> Path:
    return RESULTS_DIR / f"{deck_id}.json"


def load_cases(path: Path, slide_count: int) -> list[EvalCase]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise DatasetError(f"Cannot read dataset {path}: {exc}") from exc
    cases = []
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            case = EvalCase.model_validate_json(line)
        except ValidationError as exc:
            raise DatasetError(f"{path.name}:{number}: {exc}") from exc
        if case.expect_slide is not None and not 0 <= case.expect_slide < slide_count:
            raise DatasetError(f"{path.name}:{number}: expectSlide is outside the deck")
        cases.append(case)
    if not cases:
        raise DatasetError(f"{path.name} has no cases")
    return cases
