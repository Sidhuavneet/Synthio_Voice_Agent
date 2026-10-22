# Synthio Presenter — frontend

Next.js (App Router) client for the voice AI presenter. It lists decks from the FastAPI backend,
requests LiveKit connection details, and renders the slide the agent is presenting. The interface
contract lives in [`../docs/CONTRACT.md`](../docs/CONTRACT.md).

## Run

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, defaults to http://localhost:8500
npm install
npm run dev                  # http://localhost:3000
```

The backend API (`uv run synthio-api`) and agent worker (`uv run synthio-agent dev`) must be running
for a live session.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Layout

- `src/app` — route, layout and theme tokens (`globals.css`)
- `src/components/deck-picker` — home screen: deck cards, loading/empty/error states
- `src/components/session` — LiveKit session: floating presenter bubble (conversation + insights panel), transcript, controls (open mic / tap to speak)
- `src/components/slides` — slide stage and segmented slide progress bar
- `src/components/ui` — shared primitives (Button, Card, Chip, Alert)
- `src/hooks` — data loading, session lifecycle, slide sync (`slide.index` + `deck.id` attributes) and
  navigation (`slides.navigate` RPC)
- `src/lib` — typed API client, contract types and protocol constants
