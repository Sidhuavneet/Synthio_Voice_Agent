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
Backend allows CORS from `FRONTEND_ORIGINS` (comma-separated, default `http://localhost:3000`) and, optionally, any origin fully matching `FRONTEND_ORIGIN_REGEX` (e.g. Vercel preview deploys). Hosted, the API is started with `uvicorn synthio_backend.api.main:create_app --factory --host 0.0.0.0 --port $PORT` (see `render.yaml`).

## 2. Environment variables

`backend/.env` (template in `backend/.env.example`):

| Var | Required | Default | Purpose |
|---|---|---|---|
| `LIVEKIT_URL` | yes | — | `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | yes | — | LiveKit Cloud key |
| `LIVEKIT_API_SECRET` | yes | — | LiveKit Cloud secret |
| `API_HOST` | no | `127.0.0.1` | API bind host |
| `API_PORT` | no | `8500` | API bind port |
| `FRONTEND_ORIGINS` | no | `http://localhost:3000` | CORS allow-list (exact origins; a trailing `/` is ignored) |
| `FRONTEND_ORIGIN_REGEX` | no | — | Extra CORS origins as a regex, e.g. `https://.*\.vercel\.app` for preview deploys |
| `AGENT_NAME` | no | `synthio-presenter` | Explicit agent dispatch name |
| `STT_MODEL` | no | `deepgram/nova-3` | LiveKit Inference STT model id |
| `LLM_MODEL` | no | `google/gemini-2.5-flash` | LiveKit Inference LLM model id |
| `TTS_MODEL` | no | `cartesia/sonic-3` | LiveKit Inference TTS model id |
| `TTS_VOICE` | no | provider default | TTS voice id |
| `DEEPGRAM_API_KEY` | no | — | If set: STT (`DEEPGRAM_STT_MODEL`, default `nova-3`) and TTS (`DEEPGRAM_TTS_MODEL`, default `aura-2-thalia-en`) try the Deepgram plugin first, then LiveKit Inference |
| `GOOGLE_API_KEY` | no | — | If set: the LLM tries the Google plugin (`GOOGLE_LLM_MODEL`, default `gemini-3.5-flash`; thinking level `GOOGLE_THINKING_LEVEL`, default `minimal` for voice latency, blank = model default, Gemini 3+ only), then each of `GOOGLE_LLM_FALLBACK_MODELS` (comma-separated, default `gemini-3-flash-preview,gemini-3.1-flash-lite-preview`; free-tier quotas are per model), then LiveKit Inference |

Each component has an ordered **failover chain**: its own-key provider first (when the key is set and non-blank), **LiveKit Inference** (`livekit.agents.inference`) last — STT `[Deepgram, Inference]`, LLM `[Google Gemini, Inference]`, TTS `[Deepgram, Inference]`. A chain of two is wrapped in LiveKit's `FallbackAdapter` (`stt`/`llm`/`tts`): a failing provider (e.g. 429 or spent quota) is skipped at once with no per-provider retries (attempt timeouts: STT 5 s, LLM 10 s), the next one serves, and the failed one is probed in the background until it recovers. Both TTS providers run at 24 kHz, so failover never resamples. A chain of one (no own key) is used unwrapped. The session report's structured-output call walks the LLM chain itself, because `llm.FallbackAdapter` does not forward `response_format`. The turn detector must not depend on an exhaustible cloud quota (use the local model if `inference.TurnDetector` is cloud-metered). The chains are logged at worker start in failover order, e.g. `"llm": "google:gemini-3.5-flash -> inference:google/gemini-2.5-flash"` (never the keys).

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
  "suggestedQuestions": ["Does it usually happen from a tackle?"], // 0–4, shown as "Try asking" chips
  "slides": [                            // 5–6 items, index == position (0-based)
    {
      "index": 0,
      "title": "Why ACL injuries matter",
      "kicker": "The problem",           // short eyebrow label
      "intro": "One spoken lead-in sentence for the slide (<= 20 words).",
      "points": [                        // 2–4, shown in order and narrated in the same order
        {
          "text": "Short on-screen bullet (<= 70 chars)",
          "detail": "Very short paragraph shown under the bullet (<= 160 chars)",
          "narration": "What the agent says for this point, verbatim (20–45 words, TTS-friendly)"
        }
      ],
      "stat": { "value": "2–8x", "label": "higher risk in female players" }, // optional, may be null
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
| POST | `/api/agent/warmup` | — | `{ "status": "dispatched" | "skipped" }`: dispatches a `{"warmup":true}` job the agent ends at once (keep-alive; rate-limited to 1/min) |
| POST | `/api/session` | `{ "deckId": string, "resume"?: { "slideIndex": number, "presented": number[] } }` | `{ serverUrl, roomName, participantName, participantToken }` |

Errors: `404 {"detail": "..."}` for unknown deck, `422` for validation, `503 {"detail": "LiveKit is not configured"}` when credentials are missing.

`POST /api/session`:
- Creates a unique room name `synthio-<deckId>-<shortuuid>` and participant identity `user-<shortuuid>`.
- Token grants: `roomJoin, canPublish, canSubscribe, canPublishData`, TTL 15 min.
- Token embeds a `RoomConfiguration` with one `RoomAgentDispatch(agent_name=AGENT_NAME, metadata='{"deckId":"<deckId>","resume":{...}|null}')` so the agent is dispatched automatically on join. `resume` is validated (indices in range) and passed through unchanged.

## 5. Realtime protocol (LiveKit room)

The **agent is the single source of truth** for the current slide.

### Agent → Frontend: participant attributes (on the agent participant)

| Attribute | Value |
|---|---|
| `slide.index` | current 0-based slide index as a string, e.g. `"2"` |
| `deck.id` | deck id the agent loaded |
| `slide.point` | index of the point currently being narrated as a string, `"-1"` when none (Q&A, idle) |
| `slide.presented` | comma-separated indices of slides fully presented so far, e.g. `"0,1,2"` (used for resume + rail ticks) |
| `presentation.state` | the presentation's mode: `"presenting"` (scripted narration), `"answering"` (replying to the user), `"idle"` (between slides or waiting), `"finished"` (every slide presented **and** the wrap-up has played out; stays `finished` through later Q&A). Starts as `"idle"`. |

The frontend reads these with `useParticipantAttributes` / `useVoiceAssistant().agent` and renders the matching slide.
Built-in attributes (`lk.agent.state`) and transcriptions (`lk.transcription` text stream) are consumed via `@livekit/components-react` hooks — no custom protocol.

### Frontend → Agent: RPC

| Method | Payload (JSON string) | Response | Effect |
|---|---|---|---|
| `slides.navigate` | `{ "index": number }` | `{ "ok": true, "index": number }` or `{ "ok": false, "error": string }` | User clicked a slide/prev/next. Agent interrupts, sets `slide.index`, moves the presentation cursor there. Not yet presented → presents it. Already presented → asks "We've covered this one, shall I go through it again?" and presents it after `REPLAY_CONFIRM_DELAY` (1.0 s) of user silence (yes by default). |

### Agent tools (LLM function tools, internal to backend)

| Tool | Args | Effect |
|---|---|---|
| `go_to_slide` | `index: int`, `reason: str` | Shows a slide to answer a question (display only; does NOT move the presentation cursor). `reason` is ≤ 5 words, shown on screen ("Jumped from slide 2 to answer: …"). |
| `present_slide` | `index: int` | User asked to go to / repeat a slide: moves the cursor there and starts scripted narration from its first point. |
| `resume_presentation` | — | User says continue/yes/go on: returns to the cursor slide (if the screen differs) and resumes scripted narration from the interrupted point. |
| `flag_compliance` | `category: "off_label" \| "personal_medical_advice" \| "adverse_event" \| "out_of_scope"`, `question: str` | Records the flag in the session log and publishes a `compliance_flag` event. The agent then gives a compliant deflection (adverse events: thank, advise contacting their doctor and the regulator/manufacturer reporting line, never assess causality). |

### Agent → Frontend: events (data packets)

Reliable data packets on topic `synthio.events`, payload = UTF-8 JSON with a `type` discriminator:

| `type` | Fields | When |
|---|---|---|
| `compliance_flag` | `id: string`, `category`, `question: string`, `slideIndex: number`, `timestamp: number` (epoch ms) | Agent called `flag_compliance`. |
| `session_error` | `code: "quota_exceeded" \| "provider_error" \| "internal"`, `message: string` (user-safe) | The agent session hit an unrecoverable error; published right before the agent leaves. |
| `turn_metrics` | `turnId: string`, `sttMs: number \| null`, `eouMs: number \| null`, `llmTtftMs: number \| null`, `ttsTtfbMs: number \| null`, `totalMs: number \| null` | After each agent reply to a user turn (scripted narration and agent-initiated replies are not reported), from LiveKit `metrics_collected` events (`totalMs` = end-of-utterance delay + LLM TTFT + TTS TTFB). |
| `slide_changed` | `fromIndex: number`, `toIndex: number`, `trigger: "question" \| "user" \| "auto" \| "resume"`, `reason: string \| null`, `question: string \| null`, `timestamp: number` (epoch ms) | Every change of `slide.index`. `question`: `go_to_slide` jump (with its `reason` and the user turn being answered); `user`: the user picked or asked for a slide; `auto`: the presentation moved on; `resume`: back to the cursor after an answer. |
| `interruption` | `kind: "barge_in" \| "backchannel"`, `slideIndex: number`, `pointIndex: number \| null`, `detectionMs: number`, `timestamp: number` (epoch ms) | The user spoke over the agent, from LiveKit's adaptive `overlapping_speech` verdict: `barge_in` = real interruption (`detectionMs` = speech onset → verdict), `backchannel` = talked through ("mhm"). Skipped when the agent simply finished first. Not sent after a fallback to VAD interruption. |

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
  "followUps": [{                                                       // actions after the session
    "kind": "adverse_event" | "medical_information" | "follow_up",
    "text": "Report the adverse event: ...",
    "aeCriteria": {                                                     // adverse_event only, else null
      "identifiablePatient": true, "identifiableReporter": true,
      "suspectProduct": true, "adverseEvent": true                      // the 4 minimum report criteria
    } | null
  }],
  "interests": ["Topic the user engaged with most", "..."]
}
```
Facts (`durationSec`, `slides`, `complianceFlags`, `questions`) come from the agent's session log; `summary`, `followUps`, `interests` are LLM-generated (structured output) from the chat history. `questions` lists every user turn in order except pure backchannels ("mhm", "okay", "yes, go on"), with `slideIndex` = the slide on screen when it was answered (after any `go_to_slide` jump). The LLM only rewords a question and sets `answered`; it never adds or drops one. Without the LLM a question keeps the user's words and `answered: true`. If the LLM call fails, times out or returns unparseable output, the report is sent facts-only (`summary: ""`, `followUps` from code only, `interests: []`) and the agent logs a warning with the reason. Every adverse event flag and every open question is guaranteed a follow-up, even without the LLM: code adds one `adverse_event` follow-up (`aeCriteria: null`) per `adverse_event` flag whose question no LLM `adverse_event` follow-up quotes, and one `medical_information` follow-up per unanswered question no follow-up quotes. The frontend uses an RPC response timeout of 30 s (the agent gives the LLM up to 25 s; each provider but the last gets one 12 s attempt, as Gemini rejects request deadlines under 10 s), shows the report after the call, then disconnects. The report screen also shows the session transcript exactly as rendered during the session (speaker labels and slide/interruption markers), captured by the frontend when the session ends; it is not part of the RPC.

### Frontend → Agent: typed questions

The "Try asking" chips send the question with `useSessionMessages().send` (text stream topic `lk.chat`). The agent handles it like a spoken turn: it stops the scripted narration first, then answers by voice.

### Point highlighting

The frontend highlights the point whose index equals the agent's `slide.point` attribute (no text matching).

### Frontend-only: local progress

The frontend stores `{ deckId, slideIndex, presented, updatedAt }` per deck in `localStorage` (key `synthio.progress.<deckId>`) whenever `slide.index` / `slide.presented` change, and clears it when every slide has been presented or the user starts over. When starting a deck with saved progress the user chooses **Resume from slide N** (sends `resume`) or **Start over**. All storage access is wrapped in try/catch.

## 6. Conversation lifecycle

1. User picks a deck → `POST /api/session` → frontend connects to room with mic on.
2. Agent joins, reads `deckId`/`resume` from job metadata, greets (or "welcome back") and presents the start slide.
3. **Presenting is code-driven and scripted** (approved content, verbatim): for each slide the agent speaks `intro`, then each point's `narration` in order via `session.say`, setting `slide.point` as each segment starts. No LLM call is needed to present.
4. When a slide finishes uninterrupted, the agent waits `AUTO_ADVANCE_DELAY` (1.0 s); if the user has not started speaking it advances automatically. It never asks "any questions?" between slides (the greeting tells the user they can interrupt anytime).
5. User speaks anytime → scripted speech is interrupted; the cursor keeps (slide, point). The LLM answers in 1–3 sentences (calling `go_to_slide` first if another slide fits better). After the reply finishes, if the user stays silent for `RESUME_DELAY` (2.5 s) the agent resumes automatically from the cursor (switching the screen back first, with a 3–6 word bridge such as "Back to where we were."). The LLM can also resume immediately via `resume_presentation`.
6. After the last slide the agent gives a short LLM-generated wrap-up and invites final questions; no further auto-advance. Once the wrap-up has played out the agent sets `presentation.state` to `finished`. The frontend then waits for 10 s of quiet (agent not speaking or thinking, user not speaking) behind a visible countdown ("View report now" / "Stay"), and opens the report as if "End & view report" was clicked. Any speech pauses the countdown, which restarts from 10 s when the room is quiet again; "Stay" cancels it for the session.
7. User clicks "End & view report" → `session.report` RPC → report screen → disconnect.

## 7. Compliance rules (agent instructions)

Answer only from deck content and well-established general knowledge consistent with it. Two tiers:
- **Answer with a caveat (no flag):** general educational questions, including ones phrased personally that the deck answers generally (e.g. "How long until I can play again?" → give the general timeline/criteria from the deck, then "your own clinician will judge your case").
- **Flag + deflect:** only when answering would require an individual clinical decision (should *I* have surgery / take this dose), off-label use, a reported adverse event, or a clearly unrelated topic. Call `flag_compliance` first, then deflect in 1–2 sentences and continue.

## 8. Evals

`uv run synthio-eval [--deck acl-football]` runs a checked-in dataset (`backend/evals/<deckId>.jsonl`: `{ "input": str, "expectSlide": int | null, "expectFlag": category | null }`) through the real agent LLM + tools (provider per §2) via LiveKit Agents' testing API, prints routing accuracy and compliance precision/recall, and writes `backend/evals/results/<deckId>.json`. Requires LiveKit credentials; not part of `pytest`.
