"""``synthio-eval``: routing and compliance evals against the real agent LLM."""

import argparse
import asyncio
import json
import sys
import time

from synthio_backend.agent.providers import describe_providers
from synthio_backend.core.config import get_settings, load_env_files
from synthio_backend.decks.models import Deck
from synthio_backend.decks.repository import DeckLoadError, DeckNotFoundError, DeckRepository
from synthio_backend.evals.dataset import DatasetError, dataset_path, load_cases, results_path
from synthio_backend.evals.runner import run_cases
from synthio_backend.evals.scoring import CaseResult, EvalSummary, summarize

DEFAULT_DECK = "acl-football"
_CONCURRENCY = 4
_INPUT_WIDTH = 58


def _cell(value: object) -> str:
    return "-" if value is None else str(value)


def _percent(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.0%}"


def format_table(results: list[CaseResult]) -> str:
    header = f"{'#':>3}  {'slide':<7}  {'flag':<51}  {'ok':<4}  input"
    rows = [header, "-" * len(header)]
    for number, r in enumerate(results, start=1):
        slide = f"{_cell(r.expect_slide)} -> {_cell(r.routed_slide)}"
        flag = f"{_cell(r.expect_flag)} -> {_cell(r.flag)}"
        ok = "ERR" if r.error else ("PASS" if r.passed else "FAIL")
        text = r.user_input if len(r.user_input) <= _INPUT_WIDTH else r.user_input[:55] + "..."
        rows.append(f"{number:>3}  {slide:<7}  {flag:<51}  {ok:<4}  {text}")
    return "\n".join(rows)


def format_summary(summary: EvalSummary) -> str:
    return (
        f"passed {summary.passed}/{summary.cases} ({_percent(summary.passed / summary.cases)})"
        f" | routing accuracy {_percent(summary.routing_accuracy)}"
        f" ({summary.routing_correct}/{summary.routing_cases})"
        f" | flag precision {_percent(summary.flag_precision)}"
        f" | flag recall {_percent(summary.flag_recall)}"
        f" | errors {summary.errors}"
    )


def _load_deck(deck_id: str) -> Deck:
    return DeckRepository.from_directory(get_settings().decks_dir).get(deck_id)


def main() -> None:
    parser = argparse.ArgumentParser(prog="synthio-eval", description=__doc__)
    parser.add_argument("--deck", default=DEFAULT_DECK, help="deck id (default: %(default)s)")
    args = parser.parse_args()

    load_env_files()
    settings = get_settings()
    if not (settings.livekit_url and settings.livekit_api_key and settings.livekit_api_secret):
        sys.exit("LiveKit credentials are required (LIVEKIT_URL, LIVEKIT_API_KEY, ...)")
    try:
        deck = _load_deck(args.deck)
        cases = load_cases(dataset_path(deck.id), len(deck.slides))
    except (DeckLoadError, DeckNotFoundError, DatasetError) as exc:
        sys.exit(str(exc))

    model = describe_providers(settings)["llm"]
    print(f"Running {len(cases)} cases for {deck.id} with {model} ...")
    started = time.monotonic()
    results = asyncio.run(run_cases(deck, settings, cases, _CONCURRENCY))
    summary = summarize(results)

    print(format_table(results))
    print(format_summary(summary))
    output = results_path(deck.id)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(
            {
                "deckId": deck.id,
                "model": model,
                "durationSec": round(time.monotonic() - started),
                "summary": summary.model_dump(by_alias=True),
                "cases": [{**r.model_dump(by_alias=True), "passed": r.passed} for r in results],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Results written to {output}")
