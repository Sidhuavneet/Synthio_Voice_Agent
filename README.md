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
                                         STT → LLM → TTS via LiveKit Inference
```

1. You pick a deck. The backend returns a LiveKit token that also tells LiveKit to send the presenter agent into the room.
2. The agent greets you and presents slide by slide, using its `next_slide` tool to move on.
3. **Questions change slides:** when you ask something, the agent calls `go_to_slide` to switch to the most relevant slide, then answers.
4. **Interruptions:** start talking and the agent stops mid-sentence. LiveKit's turn detector tells real interruptions apart from "mhm".
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
