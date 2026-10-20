# Frontend ↔ Backend Contract

Single source of truth for the interfaces between `frontend/` (Next.js) and `backend/` (FastAPI + LiveKit agent worker).
Both sides MUST conform to this document. Any change here is made on `main` first.

## 1. Processes & ports

| Process | Command (from its folder) | Port |
|---|---|---|
| FastAPI (REST) | `uv run synthio-api` | 8500 (`API_PORT`) |
| LiveKit agent worker | `uv run synthio-agent dev` | — (connects out to LiveKit Cloud) |
| Next.js | `npm run dev` | 3000 |

Frontend reads the API base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:8500`). Port 8000 is avoided because Windows/Hyper-V commonly reserves it.
Backend allows CORS from `FRONTEND_ORIGINS` (comma-separated, default `http://localhost:3000`).

## 2. Environment variables

`backend/.env` (template in `backend/.env.example`):

| Var | Required | Default | Purpose |
|---|---|---|---|
| `LIVEKIT_URL` | yes | — | `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | yes | — | LiveKit Cloud key |
| `LIVEKIT_API_SECRET` | yes | — | LiveKit Cloud secret |
| `API_HOST` | no | `127.0.0.1` | API bind host |
| `API_PORT` | no | `8500` | API bind port |
| `FRONTEND_ORIGINS` | no | `http://localhost:3000` | CORS allow-list |
| `AGENT_NAME` | no | `synthio-presenter` | Explicit agent dispatch name |
| `STT_MODEL` | no | `deepgram/nova-3` | LiveKit Inference STT model id |
| `LLM_MODEL` | no | `google/gemini-2.5-flash` | LiveKit Inference LLM model id |
| `TTS_MODEL` | no | `cartesia/sonic-3` | LiveKit Inference TTS model id |
| `TTS_VOICE` | no | provider default | TTS voice id |

Only LiveKit Cloud credentials are needed: STT/LLM/TTS run through **LiveKit Inference** (`livekit.agents.inference`).

`frontend/.env.local` (template in `frontend/.env.example`): `NEXT_PUBLIC_API_URL`.

## 3. Deck schema

Decks are JSON files in `backend/src/synthio_backend/decks/data/<deck_id>.json`, validated by Pydantic on load.
JSON keys are **camelCase** on the wire (Pydantic alias generator); Python fields are snake_case.

```jsonc
{
  "id": "acl-football",                 // slug, == filename
  "title": "ACL Injuries in Football",
  "subtitle": "From prevention to return-to-play",
  "category": "sports-medicine",        // free text tag shown as a chip
  "audience": "Players, coaches and physios",
  "presenter": {                        // agent persona
    "name": "Dr. Maya",
    "role": "Sports medicine physician"
  },
  "disclaimer": "Educational content only. Not medical advice.",
  "slides": [                            // 5–6 items, index == position (0-based)
    {
      "index": 0,
      "title": "Why ACL injuries matter",
      "kicker": "The problem",           // short eyebrow label
      "bullets": ["...", "..."],         // 2–4 short on-screen bullets
      "stat": { "value": "2–8x", "label": "higher risk in female players" }, // optional, may be null
      "speakerNotes": "What the agent says when presenting this slide (60–110 words).",
      "keywords": ["risk", "incidence", "female"], // helps the LLM route questions
      "sourceIds": [0, 2]                // indices into deck.sources backing this slide (may be empty)
    }
  ],
  "sources": ["Short citation strings"]
}
```

## 4. REST API (FastAPI, prefix `/api`)

| Method | Path | Body | 200 Response |
|---|---|---|---|
| GET | `/api/health` | — | `{ "status": "ok" }` |
| GET | `/api/decks` | — | `DeckSummary[]` = `[{ id, title, subtitle, category, slideCount }]` |
| GET | `/api/decks/{deckId}` | — | `Deck` (full schema above) |
| POST | `/api/session` | `{ "deckId": string }` | `{ serverUrl, roomName, participantName, participantToken }` |

Errors: `404 {"detail": "..."}` for unknown deck, `422` for validation, `503 {"detail": "LiveKit is not configured"}` when credentials are missing.

`POST /api/session`:
- Creates a unique room name `synthio-<deckId>-<shortuuid>` and participant identity `user-<shortuuid>`.
- Token grants: `roomJoin, canPublish, canSubscribe, canPublishData`, TTL 15 min.
- Token embeds a `RoomConfiguration` with one `RoomAgentDispatch(agent_name=AGENT_NAME, metadata='{"deckId":"<deckId>"}')` so the agent is dispatched automatically on join.

## 5. Realtime protocol (LiveKit room)

The **agent is the single source of truth** for the current slide.

### Agent → Frontend: participant attributes (on the agent participant)

| Attribute | Value |
|---|---|
| `slide.index` | current 0-based slide index as a string, e.g. `"2"` |
| `deck.id` | deck id the agent loaded |

The frontend reads these with `useParticipantAttributes` / `useVoiceAssistant().agent` and renders the matching slide.
Built-in attributes (`lk.agent.state`) and transcriptions (`lk.transcription` text stream) are consumed via `@livekit/components-react` hooks — no custom protocol.

### Frontend → Agent: RPC

| Method | Payload (JSON string) | Response | Effect |
|---|---|---|---|
| `slides.navigate` | `{ "index": number }` | `{ "ok": true, "index": number }` or `{ "ok": false, "error": string }` | User clicked a slide/prev/next. Agent interrupts current speech, sets `slide.index`, and presents that slide. |

### Agent tools (LLM function tools, internal to backend)

| Tool | Args | Effect |
|---|---|---|
| `go_to_slide` | `index: int`, `reason: str` | Validates range, updates `slide.index`. Used when a user question is best answered by another slide. |
| `next_slide` | — | Advances by one (no-op error message at the end). |
| `flag_compliance` | `category: "off_label" \| "personal_medical_advice" \| "adverse_event" \| "out_of_scope"`, `question: str` | Records the flag in the session log and publishes a `compliance_flag` event. The agent then gives a compliant deflection (adverse events: thank, advise contacting their doctor and the regulator/manufacturer reporting line, never assess causality). |

### Agent → Frontend: events (data packets)

Reliable data packets on topic `synthio.events`, payload = UTF-8 JSON with a `type` discriminator:

| `type` | Fields | When |
|---|---|---|
| `compliance_flag` | `id: string`, `category`, `question: string`, `slideIndex: number`, `timestamp: number` (epoch ms) | Agent called `flag_compliance`. |
| `turn_metrics` | `turnId: string`, `sttMs: number \| null`, `eouMs: number \| null`, `llmTtftMs: number \| null`, `ttsTtfbMs: number \| null`, `totalMs: number \| null` | After each agent reply, from LiveKit `metrics_collected` events (`totalMs` = end-of-utterance delay + LLM TTFT + TTS TTFB). |

### Frontend → Agent: `session.report` RPC

| Method | Payload | Response (JSON string, < 15 KB) |
|---|---|---|
| `session.report` | `{}` | `SessionReport` below, or `{ "ok": false, "error": string }` |

```jsonc
SessionReport = {
  "ok": true,
  "deckId": "acl-football",
  "durationSec": 312,
  "summary": "2–3 sentence overview of the conversation",
  "slides": [{ "index": 0, "title": "...", "timeSec": 41 }],           // time each slide was on screen
  "questions": [{ "question": "...", "slideIndex": 4, "answered": true }],
  "complianceFlags": [ /* compliance_flag events */ ],
  "followUps": ["Actionable follow-up item", "..."],                   // unanswered/open items
  "interests": ["Topic the user engaged with most", "..."]
}
```
Facts (`durationSec`, `slides`, `complianceFlags`) come from the agent's session log; `summary`, `questions`, `followUps`, `interests` are LLM-generated (structured output) from the chat history. The frontend uses an RPC response timeout of 30 s, shows the report after the call, then disconnects.

### Frontend-only: bullet highlighting

The frontend highlights the bullet (or stat) currently being spoken by matching the last ~12 words of the agent's audio-synced transcription against each bullet's tokens and the stat label (content-word overlap; keep previous highlight when no match clears the threshold). No protocol change.

## 6. Conversation lifecycle

1. User picks a deck → `POST /api/session` → frontend connects to room with mic on.
2. Agent joins, reads `deckId` from job metadata, sets `slide.index="0"`, greets and presents slide 0.
3. After each slide the agent briefly invites questions, then calls `next_slide` and continues.
4. User asks a question anytime → speech interrupts the agent → agent answers, calling `go_to_slide` first if another slide is more relevant.
5. After the last slide the agent summarises and invites final questions.
6. User clicks "End & view report" → `session.report` RPC → report screen → disconnect.

## 7. Compliance rules (agent instructions)

Answer only from deck content and well-established general knowledge consistent with it. Never give personal medical advice, dosing for an individual, or off-label claims. On any of the four categories call `flag_compliance` first, then deflect compliantly and offer to continue the presentation.

## 8. Evals

`uv run synthio-eval [--deck acl-football]` runs a checked-in dataset (`backend/evals/<deckId>.jsonl`: `{ "input": str, "expectSlide": int | null, "expectFlag": category | null }`) through the real agent LLM + tools via LiveKit Agents' testing API, prints routing accuracy and compliance precision/recall, and writes `backend/evals/results/<deckId>.json`. Requires LiveKit credentials; not part of `pytest`.
