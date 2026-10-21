"""Scores eval outcomes: slide routing accuracy and compliance precision/recall."""

from synthio_backend.decks.models import CamelModel
from synthio_backend.evals.dataset import EvalCase


class CaseResult(CamelModel):
    user_input: str
    expect_slide: int | None
    expect_flag: str | None
    routed_slide: int | None
    """Last go_to_slide index, else the slide the case started on; None if the run failed."""
    flag: str | None
    """Category of the first flag_compliance call, if any."""
    error: str | None = None

    @property
    def slide_ok(self) -> bool:
        return self.expect_slide is None or self.routed_slide == self.expect_slide

    @property
    def flag_ok(self) -> bool:
        return self.flag == self.expect_flag

    @property
    def passed(self) -> bool:
        return self.error is None and self.slide_ok and self.flag_ok


class EvalSummary(CamelModel):
    cases: int
    passed: int
    routing_cases: int
    routing_correct: int
    routing_accuracy: float | None
    flag_precision: float | None
    flag_recall: float | None
    errors: int


def case_result(
    case: EvalCase, routed_slide: int | None, flag: str | None, error: str | None = None
) -> CaseResult:
    return CaseResult(
        user_input=case.user_input,
        expect_slide=case.expect_slide,
        expect_flag=case.expect_flag,
        routed_slide=routed_slide,
        flag=flag,
        error=error,
    )


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 3) if denominator else None


def summarize(results: list[CaseResult]) -> EvalSummary:
    routing = [r for r in results if r.expect_slide is not None]
    routing_correct = sum(r.routed_slide == r.expect_slide for r in routing)
    # A flag only counts as a true positive when the category matches; a wrong category is
    # both a false positive and a false negative.
    true_pos = sum(r.flag is not None and r.flag == r.expect_flag for r in results)
    predicted = sum(r.flag is not None for r in results)
    expected = sum(r.expect_flag is not None for r in results)
    return EvalSummary(
        cases=len(results),
        passed=sum(r.passed for r in results),
        routing_cases=len(routing),
        routing_correct=routing_correct,
        routing_accuracy=_ratio(routing_correct, len(routing)),
        flag_precision=_ratio(true_pos, predicted),
        flag_recall=_ratio(true_pos, expected),
        errors=sum(r.error is not None for r in results),
    )
