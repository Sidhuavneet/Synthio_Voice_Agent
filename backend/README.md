# Synthio backend

FastAPI REST API plus a LiveKit Agents worker that presents a slide deck by voice.
Interfaces are defined in [`docs/CONTRACT.md`](../docs/CONTRACT.md).

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/). If `uv` is not on PATH, use
`python -m uv` instead.

```sh
uv sync
cp .env.example .env                  # PowerShell: Copy-Item .env.example .env
uv run synthio-agent download-files   # optional: pre-fetch local models (VAD, turn detector)
```

Then fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`.

Speech-to-text, the LLM and text-to-speech run through LiveKit Inference, so LiveKit Cloud
credentials are the only keys needed.

## Run

```sh
uv run synthio-api          # REST API on http://127.0.0.1:8500 (API_HOST / API_PORT)
uv run synthio-agent dev    # agent worker, connects to LiveKit Cloud
```

For terminal testing without the frontend, run `uv run synthio-agent console` to talk to the
agent directly from your microphone and speakers.

## Layout

```
src/synthio_backend/
  core/config.py     settings from env / .env
  decks/             deck models, JSON data and repository
  api/               FastAPI app factory, dependencies and routers (/api/health, /api/decks, /api/session)
  session/tokens.py  LiveKit token with agent dispatch
  agent/             worker entry, presenter agent, prompts, slide controller, RPC handler
```

## Checks

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest -q
```
