/** Wire types mirroring docs/CONTRACT.md §3–§5 (camelCase JSON). */

export interface SlideStat {
  value: string;
  label: string;
}

/** One on-screen bullet; points are shown and narrated in order (contract §3). */
export interface SlidePoint {
  text: string;
  /** Very short paragraph shown under the bullet. */
  detail: string;
  /** What the presenter says for this point, verbatim. */
  narration: string;
}

export interface Slide {
  index: number;
  title: string;
  kicker: string;
  /** Spoken lead-in sentence. */
  intro: string;
  points: SlidePoint[];
  stat: SlideStat | null;
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
  /** Shown as "Try asking" chips (may be empty). */
  suggestedQuestions: string[];
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

/** Where a returning user left off (`POST /api/session` `resume`, contract §4). */
export interface ResumeRequest {
  slideIndex: number;
  /** Indices of slides already fully presented. */
  presented: number[];
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

/**
 * Why the slide changed: the agent jumped to answer a question, the user asked for or picked a
 * slide, the presentation moved on by itself, or it returned to where it was after an answer.
 */
export type SlideTrigger = "question" | "user" | "auto" | "resume";

export interface SlideChange {
  fromIndex: number;
  toIndex: number;
  trigger: SlideTrigger;
  /** The agent's short reason, for `question` jumps. */
  reason: string | null;
  /** The user turn being answered, for `question` jumps. */
  question: string | null;
  /** Epoch milliseconds. */
  timestamp: number;
}

/** The user spoke over the agent: a real barge-in, or a backchannel it talked through. */
export interface Interruption {
  kind: "barge_in" | "backchannel";
  slideIndex: number;
  /** Point being narrated when the user spoke, or null. */
  pointIndex: number | null;
  /** From the onset of the user's speech to LiveKit's interruption verdict. */
  detectionMs: number;
  /** Epoch milliseconds. */
  timestamp: number;
}

export type SessionErrorCode = "quota_exceeded" | "provider_error" | "internal";

/** The agent hit an unrecoverable error and is about to leave. */
export interface SessionErrorEvent {
  code: SessionErrorCode;
  /** User-safe message. */
  message: string;
}

/** Data packets on the `synthio.events` topic, discriminated by `type`. */
export type AgentEvent =
  | ({ type: "compliance_flag" } & ComplianceFlag)
  | ({ type: "session_error" } & SessionErrorEvent)
  | ({ type: "turn_metrics" } & TurnMetrics)
  | ({ type: "slide_changed" } & SlideChange)
  | ({ type: "interruption" } & Interruption);

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

export type FollowUpKind = "adverse_event" | "medical_information" | "follow_up";

/** The four minimum criteria for a valid adverse event report, as heard in the session. */
export interface AdverseEventCriteria {
  identifiablePatient: boolean;
  identifiableReporter: boolean;
  suspectProduct: boolean;
  adverseEvent: boolean;
}

export interface FollowUp {
  kind: FollowUpKind;
  text: string;
  /** Only on `adverse_event` items, and null when not assessed. */
  aeCriteria: AdverseEventCriteria | null;
}

/** LLM-generated part of the report. */
export interface SessionInsights {
  summary: string;
  questions: ReportQuestion[];
  followUps: FollowUp[];
  interests: string[];
}

export type SessionReport = SessionFacts & SessionInsights;

export type SessionReportResponse =
  | ({ ok: true } & SessionReport)
  | { ok: false; error: string };
