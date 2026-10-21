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

Backend on [Render](https://render.com), frontend on [Vercel](https://vercel.com). **Auto-deploy: every push to `main` redeploys both.**

1. **Render** (backend): New → Blueprint → pick this repo. [`render.yaml`](render.yaml) creates two services from `backend/`:
   - `synthio-api` (web service, free plan): the REST API, health check `/api/health`. A free web service sleeps after inactivity, so the first request after a pause is slow.
   - `synthio-agent` (background worker): the LiveKit presenter agent. Background workers need a paid instance type on Render.

   Fill the secret env vars when prompted: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and optionally `DEEPGRAM_API_KEY` / `GOOGLE_API_KEY` (own keys are tried first, LiveKit Inference is the runtime fallback).
2. **Vercel** (frontend): import the repo, set **Root Directory** to `frontend`, and add `NEXT_PUBLIC_API_URL=https://<synthio-api>.onrender.com`. Next.js is detected automatically.
3. Back on Render, set `FRONTEND_ORIGINS` on `synthio-api` to the Vercel URL (e.g. `https://synthio.vercel.app`). To allow preview deploys too, set `FRONTEND_ORIGIN_REGEX` (e.g. `https://synthio-.*\.vercel\.app`).

Alternative host for the worker: [LiveKit Cloud Agents](https://docs.livekit.io/agents/ops/deployment/) (`lk agent create` from `backend/`).

## 60-second demo

Use the **ACL** deck (or **Tenvoryx** for the pharma flow). Every line below can be spoken, or clicked in the "Try asking" chips under the slides.

1. **Let it present** for a few seconds: the spoken bullet is highlighted.
2. **Cut in mid-sentence:** "Does it usually happen from a tackle?" It stops at once, marks the bullet you interrupted as *Paused here*, jumps to *How the ACL tears* with a "Jumped from slide 1 to answer: …" chip, and answers.
3. **Stay quiet:** it says "Right, back to where we were." and resumes from the paused bullet. Saying "mhm" while it talks does not stop it; the latency card counts it as *talked through*.
4. **"How long until I can play again?"** answers with the general timeline plus a caveat. Educational, not flagged.
5. **"Should I skip surgery and just do rehab?"** is flagged as personal medical advice and deflected.
6. On **Tenvoryx**: "One of my patients felt dizzy after starting Tenvoryx." is flagged as an adverse event. The agent thanks them and points to safety reporting, without judging causality.
7. **End & view report:** a session timeline (slides over time, with every jump, cut-in and flag), questions, and typed follow-ups. Adverse events show which of the four minimum reporting criteria were captured. **Copy follow-up email** gives a ready hand-off.

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
