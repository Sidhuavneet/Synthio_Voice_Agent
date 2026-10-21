import json
from pathlib import Path

import pytest
from livekit.agents import FunctionCallEvent, RunEvent, llm

from synthio_backend.evals.dataset import DatasetError, EvalCase, load_cases
from synthio_backend.evals.runner import raised_flag, routed_slide
from synthio_backend.evals.scoring import case_result, summarize


def _case(expect_slide: int | None, expect_flag: str | None) -> EvalCase:
    return EvalCase.model_validate(
        {"input": "q", "expectSlide": expect_slide, "expectFlag": expect_flag}
    )


def _call(name: str, **arguments: object) -> FunctionCallEvent:
    return FunctionCallEvent(
        item=llm.FunctionCall(call_id=name, name=name, arguments=json.dumps(arguments))
    )


def test_load_cases(tmp_path: Path) -> None:
    path = tmp_path / "deck.jsonl"
    path.write_text(
        '{"input": "a", "expectSlide": 1, "expectFlag": null}\n\n'
        '{"input": "b", "expectSlide": null, "expectFlag": "adverse_event"}\n'
    )
    cases = load_cases(path, slide_count=5)
    assert [(c.user_input, c.expect_slide, c.expect_flag) for c in cases] == [
        ("a", 1, None),
        ("b", None, "adverse_event"),
    ]


@pytest.mark.parametrize(
    "line",
    [
        '{"input": "a", "expectSlide": 9, "expectFlag": null}',
        '{"input": "a", "expectSlide": null, "expectFlag": "unknown"}',
        "not json",
    ],
)
def test_load_cases_rejects_invalid_lines(tmp_path: Path, line: str) -> None:
    path = tmp_path / "deck.jsonl"
    path.write_text(line + "\n")
    with pytest.raises(DatasetError, match=r"deck\.jsonl:1"):
        load_cases(path, slide_count=5)


def test_routed_slide_and_flag_from_function_calls() -> None:
    events: list[RunEvent] = [
        _call("flag_compliance", category="off_label", question="q"),
        _call("go_to_slide", index=2, reason="r"),
        _call("go_to_slide", index=4, reason="r"),
    ]
    assert routed_slide(events, start=0) == 4
    assert raised_flag(events) == "off_label"
    assert routed_slide([], start=0) == 0
    assert raised_flag([]) is None


def test_summarize_scores_routing_and_flags() -> None:
    results = [
        case_result(_case(1, None), routed_slide=1, flag=None),  # pass
        case_result(_case(2, None), routed_slide=0, flag=None),  # wrong slide
        case_result(_case(None, "adverse_event"), routed_slide=0, flag="adverse_event"),  # pass
        case_result(_case(None, "off_label"), routed_slide=0, flag="out_of_scope"),  # wrong
        case_result(_case(3, None), routed_slide=3, flag="out_of_scope"),  # false positive
        case_result(_case(None, "out_of_scope"), None, None, error="boom"),  # error
    ]
    summary = summarize(results)
    assert summary.cases == 6
    assert summary.passed == 2
    assert (summary.routing_cases, summary.routing_correct) == (3, 2)
    assert summary.routing_accuracy == pytest.approx(0.667)
    assert summary.flag_precision == pytest.approx(1 / 3, abs=1e-3)
    assert summary.flag_recall == pytest.approx(1 / 3, abs=1e-3)
    assert summary.errors == 1
