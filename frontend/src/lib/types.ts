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
  /** Indices into `Deck.sources` backing this slide (may be empty). */
  sourceIds: number[];
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

export type ComplianceCategory =
  | "off_label"
  | "personal_medical_advice"
  | "adverse_event"
  | "out_of_scope";

export interface ComplianceFlag {
  id: string;
  category: ComplianceCategory;
  question: string;
  slideIndex: number;
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface TurnMetrics {
  turnId: string;
  sttMs: number | null;
  eouMs: number | null;
  llmTtftMs: number | null;
  ttsTtfbMs: number | null;
  /** End-of-utterance delay + LLM TTFT + TTS TTFB. */
  totalMs: number | null;
}

/** Data packets on the `synthio.events` topic, discriminated by `type`. */
export type AgentEvent =
  | ({ type: "compliance_flag" } & ComplianceFlag)
  | ({ type: "turn_metrics" } & TurnMetrics);

export interface SlideTime {
  index: number;
  title: string;
  timeSec: number;
}

export interface ReportQuestion {
  question: string;
  slideIndex: number;
  answered: boolean;
}

/** Facts from the agent's session log; the frontend can also derive these locally. */
export interface SessionFacts {
  deckId: string;
  durationSec: number;
  slides: SlideTime[];
  complianceFlags: ComplianceFlag[];
}

/** LLM-generated part of the report. */
export interface SessionInsights {
  summary: string;
  questions: ReportQuestion[];
  followUps: string[];
  interests: string[];
}

export type SessionReport = SessionFacts & SessionInsights;

export type SessionReportResponse =
  | ({ ok: true } & SessionReport)
  | { ok: false; error: string };
