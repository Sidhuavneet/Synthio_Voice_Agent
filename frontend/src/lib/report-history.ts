import { isFiniteNumber, isRecord, parseJson } from "@/lib/guards";
import { parseSessionReportResponse } from "@/lib/report";
import type { SessionReport } from "@/lib/types";

/**
 * Past session reports kept in this browser (latest first). Storage is a convenience: every
 * access is guarded, corrupt data is ignored, and oversized entries are trimmed or skipped.
 */

export const REPORTS_KEY = "synthio.reports";
export const MAX_REPORTS = 10;
/** Upper bound for one serialized entry; a larger transcript is dropped before the report is. */
export const MAX_ENTRY_CHARS = 200_000;
/** Upper bound for the whole serialized list, well under typical 5 MB localStorage quotas. */
export const MAX_TOTAL_CHARS = 1_000_000;

/** Notifies same-tab subscribers; the `storage` event only fires in other tabs. */
const CHANGE_EVENT = "synthio:reports";

export interface SavedReport<T = unknown> {
  /** Stable per session: `${deckId}:${endedAt}`. */
  id: string;
  deckId: string;
  deckTitle: string;
  /** Epoch milliseconds. */
  endedAt: number;
  report: SessionReport;
  /** Transcript rows, typed by the caller (e.g. the session's `TranscriptRow`). */
  transcript: T[];
  /** True when the transcript was too large to keep. */
  transcriptDropped: boolean;
}

export interface SaveReportInput<T = unknown> {
  report: SessionReport;
  transcript: readonly T[];
  deckId: string;
  deckTitle: string;
  endedAt: number;
}

export function reportId(deckId: string, endedAt: number): string {
  return `${deckId}:${endedAt}`;
}

/** Validates the stored report with the same rules as a live `session.report` response. */
function parseStoredReport(value: unknown): SessionReport | null {
  if (!isRecord(value)) return null;
  const response = parseSessionReportResponse(JSON.stringify({ ...value, ok: true }));
  if (!response.ok) return null;
  const { deckId, durationSec, slides, complianceFlags, summary, questions, followUps, interests } =
    response;
  return { deckId, durationSec, slides, complianceFlags, summary, questions, followUps, interests };
}

function parseEntry<T>(
  value: unknown,
  parseTranscriptItem?: (item: unknown) => T | null,
): SavedReport<T> | null {
  if (!isRecord(value)) return null;
  const { deckId, deckTitle, endedAt, transcript, transcriptDropped } = value;
  if (typeof deckId !== "string" || typeof deckTitle !== "string" || !isFiniteNumber(endedAt)) {
    return null;
  }
  const report = parseStoredReport(value.report);
  if (!report) return null;
  const rows = Array.isArray(transcript) ? transcript : [];
  const parsed = parseTranscriptItem
    ? rows.map(parseTranscriptItem).filter((row): row is T => row !== null)
    : (rows as T[]);
  return {
    id: reportId(deckId, endedAt),
    deckId,
    deckTitle,
    endedAt,
    report,
    transcript: parsed,
    transcriptDropped: transcriptDropped === true,
  };
}

/** Parses the stored list, dropping malformed and duplicate entries; newest first, at most `MAX_REPORTS`. */
export function parseReports<T = unknown>(
  raw: string | null,
  parseTranscriptItem?: (item: unknown) => T | null,
): SavedReport<T>[] {
  if (raw === null) return [];
  const value = parseJson(raw);
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, SavedReport<T>>();
  for (const item of value) {
    const entry = parseEntry(item, parseTranscriptItem);
    if (entry && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => b.endedAt - a.endedAt).slice(0, MAX_REPORTS);
}

/**
 * Builds the entry to store, or null if even the report alone exceeds `MAX_ENTRY_CHARS`.
 * An oversized transcript is dropped (and flagged) rather than losing the report.
 */
export function buildEntry<T>(input: SaveReportInput<T>): SavedReport<T> | null {
  const entry: SavedReport<T> = {
    id: reportId(input.deckId, input.endedAt),
    deckId: input.deckId,
    deckTitle: input.deckTitle,
    endedAt: input.endedAt,
    report: input.report,
    transcript: [...input.transcript],
    transcriptDropped: false,
  };
  if (JSON.stringify(entry).length <= MAX_ENTRY_CHARS) return entry;
  const withoutTranscript = { ...entry, transcript: [], transcriptDropped: true };
  return JSON.stringify(withoutTranscript).length <= MAX_ENTRY_CHARS ? withoutTranscript : null;
}

/**
 * Puts `entry` into `existing` (replacing the same session), newest first, then trims to
 * `MAX_REPORTS` and drops the oldest until the list fits in `maxChars`.
 */
export function mergeReports<T>(
  existing: readonly SavedReport<T>[],
  entry: SavedReport<T>,
  maxChars = MAX_TOTAL_CHARS,
): SavedReport<T>[] {
  const list = [entry, ...existing.filter((item) => item.id !== entry.id)]
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, MAX_REPORTS);
  while (list.length > 1 && JSON.stringify(list).length > maxChars) list.pop();
  return list;
}

export function readStoredReports(): string | null {
  try {
    return window.localStorage.getItem(REPORTS_KEY);
  } catch {
    return null;
  }
}

function notifyChange(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // No window (tests, SSR): nobody to notify.
  }
}

/**
 * Stores a finished session's report among the latest `MAX_REPORTS`. Returns the saved entry,
 * or null if it couldn't be stored (too large, or storage unavailable/full).
 */
export function saveReport<T = unknown>(input: SaveReportInput<T>): SavedReport<T> | null {
  const entry = buildEntry(input);
  if (!entry) return null;
  let list = mergeReports(parseReports<T>(readStoredReports()), entry);
  // On a quota error, retry with fewer older reports before giving up.
  while (list.includes(entry)) {
    try {
      window.localStorage.setItem(REPORTS_KEY, JSON.stringify(list));
      notifyChange();
      return entry;
    } catch {
      list = list.slice(0, -1);
    }
  }
  return null;
}

export function listReports<T = unknown>(
  parseTranscriptItem?: (item: unknown) => T | null,
): SavedReport<T>[] {
  return parseReports(readStoredReports(), parseTranscriptItem);
}

export function clearReports(): void {
  try {
    window.localStorage.removeItem(REPORTS_KEY);
    notifyChange();
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Calls `onChange` whenever saved reports may have changed, in this tab or another. */
export function subscribeToReports(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
