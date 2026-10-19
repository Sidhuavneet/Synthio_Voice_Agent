# Synthio Labs — Voice Slide Presenter

A voice AI agent that presents a 5–6 slide deck, jumps to the right slide when you ask a question, and stops speaking the moment you interrupt.

- `frontend/` — Next.js UI (slides, live transcript, mic controls)
- `backend/` — FastAPI (decks + LiveKit session tokens) and the LiveKit voice agent worker
- `docs/CONTRACT.md` — the interface both sides follow

Setup instructions are completed once both sides land on `main`.
