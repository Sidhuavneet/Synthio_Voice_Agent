# Synthio backend

FastAPI REST API plus a LiveKit Agents worker that presents a slide deck by voice.
Interfaces are defined in [`docs/CONTRACT.md`](../docs/CONTRACT.md).

## Setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/). If `uv` is not on PATH, use
`python -m uv` instead.

```sh
uv sync
cp .env.example .env                  # or .env.local; PowerShell: Copy-Item .env.example .env
```

Then fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`.

### Providers

Each component has an ordered failover chain: the own-key provider first (when its key is set),
LiveKit Inference last. With two entries LiveKit's `FallbackAdapter` switches to the next one at
runtime when a provider fails (e.g. a 429 or spent quota) and switches back once it recovers.
The chains are logged when a job process starts, never the keys, e.g.
`"stt": "deepgram:nova-3 -> inference:deepgram/nova-3"`.

| Component | First, if its key is set | Fallback (always) |
|---|---|---|
| Speech-to-text | `DEEPGRAM_API_KEY` → Deepgram plugin (`DEEPGRAM_STT_MODEL`) | LiveKit Inference (`STT_MODEL`) |
| LLM | `GOOGLE_API_KEY` → Google Gemini plugin (`GOOGLE_LLM_MODEL`) | LiveKit Inference (`LLM_MODEL`) |
| Text-to-speech | `DEEPGRAM_API_KEY` → Deepgram plugin (`DEEPGRAM_TTS_MODEL`) | LiveKit Inference (`TTS_MODEL`, `TTS_VOICE`) |
| Turn detector | always local (`turn-detector-v1-mini`) | |
| Interruption (barge-in) | always LiveKit Inference adaptive mode | local VAD, automatically, if it fails (e.g. quota spent) |

With no own keys, LiveKit Cloud credentials are the only keys needed, but everything then
draws on the LiveKit Inference quota. When that quota is spent the agent publishes a
`session_error` event (`quota_exceeded`) and leaves the room instead of sitting on
"listening"; add `DEEPGRAM_API_KEY` (https://console.deepgram.com/signup, then Project → API
Keys) and `GOOGLE_API_KEY` (https://aistudio.google.com/app/apikey) to keep going. The turn detector and
voice activity detection run locally from weights bundled with `livekit-local-inference`, so
there is nothing to download and they never use the quota. Adaptive interruption (telling a
real barge-in from a backchannel like "mm-hm") does use LiveKit Inference; when that fails
LiveKit drops to plain VAD interruption for the rest of the session without ending it.

## Run

```sh
uv run synthio-api          # REST API on http://127.0.0.1:8500 (API_HOST / API_PORT)
uv run synthio-agent dev    # agent worker, connects to LiveKit Cloud
```

For terminal testing without the frontend, run `uv run synthio-agent console` to talk to the
agent directly from your microphone and speakers.

## Agent features

- **Scripted presenting**: the presentation controller (`agent/presentation.py`) speaks each
  slide's `intro` and then every point's `narration` in on-screen order with `session.say`,
  publishing `slide.point` for the highlight and `slide.presented` when a slide finishes. It
  advances after 1 s of silence, resumes from the interrupted point 2.5 s after an answer
  (switching the screen back with a short bridge if a question moved it), asks before
  replaying a slide already covered, and ends with one short LLM wrap-up. The LLM only
  answers questions (1–3 sentences) and steers with `go_to_slide`, `present_slide` and
  `resume_presentation`.
- **Resume**: `POST /api/session` accepts `resume: { slideIndex, presented }`, passed to the
  agent in the dispatch metadata; the agent welcomes the user back at that slide.
- **Compliance mode**, two tiers: general questions, including personally phrased ones the deck
  answers in general terms ("How long until I can play again?"), are answered with a short
  caveat and not flagged. Only individual clinical decisions, off-label use, reported adverse
  events and clearly unrelated topics go through the `flag_compliance` tool, which records
  them, publishes a `compliance_flag` event on the `synthio.events` data topic, and the agent
  deflects compliantly.
- **Session report**: the `session.report` RPC returns slide timings, compliance flags and
  every user question (backchannels left out) from the session log, plus a summary, follow-ups
  and interests from one structured LLM call that also rewords the questions and marks which
  were answered (facts only, with a logged warning, if that call fails or takes over 25 s). Follow-ups are typed
  (`adverse_event`, `medical_information`, `follow_up`); adverse events carry the four minimum
  reporting criteria. Every adverse event flag and every open question is guaranteed a
  follow-up, even without the LLM.
- **Session errors**: an unrecoverable provider error (or a spent quota) publishes a
  `session_error` event and shuts the job down so the agent leaves the room.
- **Turn metrics**: per-reply `turn_metrics` events (EOU delay, LLM TTFT, TTS TTFB) assembled
  from LiveKit metrics.
- **Slide changes and interruptions**: `slide_changed` events carry why the slide moved
  (`question` with the agent's reason, `user`, `auto`, `resume`); `interruption` events come
  from LiveKit's adaptive `overlapping_speech` verdicts (barge-in with detection time, or a
  backchannel the agent talked through).
- **Typed questions**: text sent on `lk.chat` (the frontend's "Try asking" chips) goes through
  a custom text-input callback, so it stops the scripted narration like a spoken question.

## Evals

```sh
uv run synthio-eval --deck acl-football
```

Runs `evals/<deckId>.jsonl` through the real agent LLM and tools (LiveKit Agents testing API,
text only, LiveKit credentials required, LLM provider chosen as above). Routing is scored on
`go_to_slide` calls and compliance on `flag_compliance` calls; the dataset includes personally
phrased general questions that must not be flagged. It prints a per-case table with slide
routing accuracy and compliance precision/recall, and writes `evals/results/<deckId>.json`.
Not part of `pytest`.

## Layout

```
src/synthio_backend/
  core/config.py     settings from env / .env
  decks/             deck models, JSON data and repository
  api/               FastAPI app factory, dependencies and routers (/api/health, /api/decks, /api/session)
  session/tokens.py  LiveKit token with agent dispatch
  session/resume.py  resume state shared by the API and the agent
  agent/             worker entry, presenter agent and tools, presentation controller and its
                     LiveKit adapters, provider factories, prompts, slide controller, RPC
                     handlers, session log and report, data-packet events, error mapping,
                     turn metrics
  evals/             synthio-eval dataset loading, runner and scoring
```

## Checks

```sh
uv run ruff check .
uv run ruff format --check .
uv run mypy src
uv run pytest -q
```
