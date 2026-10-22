# Synthio Labs — Voice Slide Presenter

A voice AI agent that presents a 5–6 slide deck, jumps to the right slide when you ask a question, and stops talking the moment you interrupt.

The primary deck is **ACL Injuries in Football: Prevention to Return-to-Play**, presented by an AI sports-medicine physician. Three more decks show the same engine on other topics:
- Concussion in football
- Early action in multiple sclerosis (unbranded disease education)
- Tenvoryx, a fictional drug presented to a physician by an AI medical science liaison

## How it works

```
Next.js (3000) ──REST──▶ FastAPI (8500) ── mints LiveKit token + dispatches agent
     │                                              
     └──── WebRTC (LiveKit Cloud) ◀──▶ Presenter agent (LiveKit Agents, Python)
                                         STT → LLM → TTS (own keys first, LiveKit Inference fallback)
```

1. You pick a deck. The backend returns a LiveKit token that also tells LiveKit to send the presenter agent into the room.
2. The agent greets you and presents each slide from an approved script, point by point, highlighting the bullet it is speaking. It moves on by itself after a short silence.
3. **Questions change slides:** when you ask something, the LLM calls `go_to_slide` to show the most relevant slide, then answers in one to three sentences. The screen and transcript say why it jumped. After a short silence it goes back to where it was.
4. **Interruptions:** start talking and the agent stops mid-sentence. LiveKit's adaptive interruption model tells real interruptions apart from "mhm". The bullet you cut into is marked as paused, and the agent resumes from that point.
5. **One source of truth:** the agent owns the current slide and publishes it as the `slide.index` participant attribute. Clicking a slide sends a `slides.navigate` call to the agent.

The full interface is in [docs/CONTRACT.md](docs/CONTRACT.md).

## Quick start

Prerequisites: Node 20+, Python 3.12+, [uv](https://docs.astral.sh/uv/), and a free [LiveKit Cloud](https://cloud.livekit.io) project. Its URL, API key and secret are the only credentials needed.

```sh
# 1. Backend API
cd backend
uv sync
cp .env.example .env              # PowerShell: Copy-Item .env.example .env — then fill the LIVEKIT_* values
uv run synthio-api                # http://127.0.0.1:8500

# 2. Agent worker (second terminal)
cd backend
uv run synthio-agent dev

# 3. Frontend (third terminal)
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Open http://localhost:3000, pick a deck, allow the microphone, and start talking whenever you like.

## Deploy

Zero cost: agent on [LiveKit Cloud Agents](https://docs.livekit.io/deploy/agents/) (free Build plan), API on a free [Render](https://render.com) web service, frontend on [Vercel](https://vercel.com) Hobby.

Free tiers sleep when idle: [`keep-alive.yml`](.github/workflows/keep-alive.yml) pings the API every 10 minutes (best-effort GitHub cron), and the UI shows a "waking up" message when the API or the agent is cold-starting.

| Part | Host | Config | Redeploys on push to `main` |
|---|---|---|---|
| Agent worker (`synthio-agent`) | LiveKit Cloud | [`backend/Dockerfile`](backend/Dockerfile), `backend/livekit.toml` | via [`deploy-agent.yml`](.github/workflows/deploy-agent.yml) (or run `lk agent deploy`) |
| REST API (`synthio-api`) | Render, free web service | [`render.yaml`](render.yaml) | yes |
| Frontend | Vercel | `frontend/` | yes |

### 1. Agent → LiveKit Cloud

Install the [LiveKit CLI](https://docs.livekit.io/home/cli/) (`winget install LiveKit.LiveKitCLI` on Windows, `brew install livekit-cli` on macOS), then from `backend/`:

```sh
lk cloud auth                     # opens the browser; links the CLI to your LiveKit Cloud project
cp .env.agent.example .env.agent.local   # PowerShell: Copy-Item; fill in only what you use
lk agent create --secrets-file .env.agent.local --ignore-empty-secrets
```

`lk agent create` uploads `backend/` (minus `.dockerignore`, `.gitignore` and `.env.*` files), builds the [`Dockerfile`](backend/Dockerfile) in LiveKit Cloud, starts the worker, and writes `livekit.toml` (agent id and project). **Commit `livekit.toml`**: later deploys and the GitHub workflow use it.

- **Secrets:** `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are injected by LiveKit Cloud and cannot be set as secrets, so they are not in `.env.agent.example`. Everything in it is optional (no keys means LiveKit Inference only). Change secrets later with `lk agent update-secrets --secrets-file .env.agent.local --ignore-empty-secrets` (rolling restart; add `--overwrite` to drop secrets not in the file). List names with `lk agent secrets`.
- **Dispatch:** the worker keeps its dispatch name from code, `synthio-presenter` (`AGENT_NAME`), which the API puts in every token. If you change `AGENT_NAME`, set the same value on Render and as an agent secret.
- **Redeploy:** `lk agent deploy` (from `backend/`). **Status / logs:** `lk agent status`, `lk agent logs`.
- **Free Build plan:** 1 agent deployment, up to 5 concurrent sessions, 1,000 agent session minutes a month (hard cap) and $2.50 of LiveKit Inference credit a month. The agent scales to zero when idle, so the first session after a pause waits about 10–20 s for a cold start. Rollback needs a paid plan (on free, revert and redeploy).

Check the image locally (optional): `docker build -t synthio-agent backend`.

### 2. API → Render (free web service)

New → **Blueprint** → pick this repo; [`render.yaml`](render.yaml) creates only `synthio-api` on the free plan (or New → **Web Service** by hand: root directory `backend`, build `pip install uv && uv sync --frozen --no-dev`, start `uv run --no-sync uvicorn synthio_backend.api.main:create_app --factory --host 0.0.0.0 --port $PORT`, health check `/api/health`, env `PYTHON_VERSION=3.13.5`).

Env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (same project as the agent), `FRONTEND_ORIGINS` (the Vercel URL, e.g. `https://synthio.vercel.app`) and optionally `FRONTEND_ORIGIN_REGEX` for preview deploys (e.g. `https://synthio-.*\.vercel\.app`). The API needs no Deepgram or Google keys. A free web service sleeps after about 15 minutes idle, so the first request after a pause is slow.

### 3. Frontend → Vercel

Import the repo, set **Root Directory** to `frontend`, and add `NEXT_PUBLIC_API_URL=https://<synthio-api>.onrender.com`. Next.js is detected automatically. Then put the Vercel URL into `FRONTEND_ORIGINS` on Render.

### 4. Auto-deploy

- **Render** and **Vercel** redeploy on every push to `main`.
- **Agent:** [`.github/workflows/deploy-agent.yml`](.github/workflows/deploy-agent.yml) runs LiveKit's [deploy action](https://github.com/livekit/deploy-action) (`lk agent deploy`) on pushes to `main` that touch `backend/`. Add repo secrets `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`; it skips (successfully, with a notice) until those secrets are set and `backend/livekit.toml` is committed. Without it, run `lk agent deploy` by hand. Agent secrets stay in LiveKit Cloud (`lk agent update-secrets`).

## 60-second demo

Use the **ACL** deck (or **Tenvoryx** for the pharma flow). Every line below can be spoken, or clicked in the "Try asking" chips under the slides.

1. **Let it present** for a few seconds: the spoken bullet is highlighted.
2. **Cut in mid-sentence:** "Does it usually happen from a tackle?" It stops at once, marks the bullet you interrupted as *Paused here*, jumps to *How the ACL tears* with a "Jumped from slide 1 to answer: …" chip, and answers.
3. **Stay quiet:** it says "Right, back to where we were." and resumes from the paused bullet. Saying "mhm" while it talks does not stop it; the latency card counts it as *talked through*.
4. **"How long until I can play again?"** answers with the general timeline plus a caveat. Educational, not flagged.
5. **"Should I skip surgery and just do rehab?"** is flagged as personal medical advice and deflected.
6. On **Tenvoryx**: "One of my patients felt dizzy after starting Tenvoryx." is flagged as an adverse event. The agent thanks them and points to safety reporting, without judging causality.
7. **End & view report** (or let the deck finish: the report opens by itself after 10 s of quiet): a session timeline (slides over time, with every jump, cut-in and flag), questions, typed follow-ups and the full transcript. Adverse events show which of the four minimum reporting criteria were captured. **Copy follow-up email** gives a ready hand-off.

## Design decisions

- **Scripted narration, LLM only for questions.** Slide content is spoken verbatim from approved text, as regulated medical and pharma content requires. The LLM never improvises a slide; it only answers, routes and flags. This also makes presenting cost no LLM tokens and keeps latency low.
- **The agent owns the slide.** One source of truth (`slide.index`), so voice, clicks and resume can never disagree. Every change carries a `trigger` (question, user, auto, resume), which drives the on-screen explanations.
- **Measured, not claimed.** Per-turn voice-to-voice latency (end of turn, LLM time to first token, TTS time to first byte) and barge-in detection time are shown live and come straight from LiveKit's metrics and its adaptive interruption verdicts.
- **Compliance that can't be talked out of.** Two tiers: answer with a caveat, or flag and deflect. Every adverse event flag and every open question is guaranteed a follow-up, even without the LLM.
- **Evals.** `uv run synthio-eval --deck acl-football` runs a labelled dataset through the real agent LLM and tools, and scores slide routing accuracy and compliance precision and recall. The latest results are in [backend/evals/results](backend/evals/results).

## Repository layout

| Path | What |
|---|---|
| `backend/` | FastAPI API, LiveKit presenter agent, deck JSON, tests ([README](backend/README.md)) |
| `frontend/` | Next.js UI: deck picker, slide stage, live transcript, controls ([README](frontend/README.md)) |
| `docs/CONTRACT.md` | Interface both sides follow |

## Adding a deck

Drop a new `<id>.json` into `backend/src/synthio_backend/decks/data/` following the schema in the contract. It is validated when the API starts and appears in the picker automatically.

## Notes

- Content is educational only, not medical advice. Tenvoryx and its trial data are fictional.
- The API defaults to port 8500 because Windows/Hyper-V often reserves 8000. Change it with `API_PORT` and `NEXT_PUBLIC_API_URL`.
