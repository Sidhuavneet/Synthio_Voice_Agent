/** Wire types mirroring docs/CONTRACT.md §3–§5 (camelCase JSON). */

export interface SlideStat {
  value: string;
  label: string;
}

export interface Slide {
  index: number;
  title: string;
  kicker: string;
  bullets: string[];
  stat: SlideStat | null;
  speakerNotes: string;
  keywords: string[];
}

export interface Presenter {
  name: string;
  role: string;
}

export interface Deck {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  audience: string;
  presenter: Presenter;
  disclaimer: string;
  slides: Slide[];
  sources: string[];
}

export interface DeckSummary {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  slideCount: number;
}

export interface ConnectionDetails {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
}

export interface NavigateRequest {
  index: number;
}

export type NavigateResponse = { ok: true; index: number } | { ok: false; error: string };
