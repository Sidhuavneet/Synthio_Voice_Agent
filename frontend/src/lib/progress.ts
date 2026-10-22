import { isFiniteNumber, isNonNegativeInteger, isRecord, parseJson } from "@/lib/guards";
import type { ResumeRequest } from "@/lib/types";

/** Saved per deck in localStorage (contract §5, "Frontend-only: local progress"). */
export interface DeckProgress {
  deckId: string;
  slideIndex: number;
  /** Sorted indices of slides fully presented. */
  presented: number[];
  /** Epoch milliseconds. */
  updatedAt: number;
  /**
   * Epoch milliseconds when every slide had been presented. Absent on in-progress records and
   * on records saved before completion tracking existed.
   */
  completedAt?: number;
}

export type DeckStatus = "not_started" | "in_progress" | "completed";

/** What the progress panel shows for one deck. */
export interface DeckProgressSummary {
  status: DeckStatus;
  presentedCount: number;
  slideCount: number;
  /** Slide a resume would continue from; null unless in progress. */
  resumeIndex: number | null;
  /** Last saved activity (epoch ms); null when not started. */
  updatedAt: number | null;
  completedAt: number | null;
  /** The resumable record, only while in progress. */
  progress: DeckProgress | null;
}

const KEY_PREFIX = "synthio.progress.";
/** Notifies same-tab subscribers; the `storage` event only fires in other tabs. */
const CHANGE_EVENT = "synthio:progress";

export function progressKey(deckId: string): string {
  return `${KEY_PREFIX}${deckId}`;
}

/** True once every slide of the deck has been presented. */
export function isDeckComplete(presented: readonly number[], slideCount: number): boolean {
  return slideCount > 0 && new Set(presented.filter((i) => i < slideCount)).size >= slideCount;
}

/** Whether there is anything worth resuming: a slide was finished or the user moved past slide 1. */
export function hasProgress(slideIndex: number, presented: readonly number[]): boolean {
  return slideIndex > 0 || presented.length > 0;
}

/**
 * Validates a stored value against the deck it should belong to, keeping completed records.
 * Returns null for malformed, foreign, out-of-range or empty progress.
 */
export function parseStoredProgress(
  raw: string | null,
  deckId: string,
  slideCount: number,
): DeckProgress | null {
  if (raw === null) return null;
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { deckId: storedId, slideIndex, presented, updatedAt, completedAt } = value;
  if (
    storedId !== deckId ||
    !isNonNegativeInteger(slideIndex) ||
    slideIndex >= slideCount ||
    !Array.isArray(presented) ||
    !isFiniteNumber(updatedAt)
  ) {
    return null;
  }
  const indices = [
    ...new Set(presented.filter((i): i is number => isNonNegativeInteger(i) && i < slideCount)),
  ].sort((a, b) => a - b);
  if (!hasProgress(slideIndex, indices)) return null;
  const complete = isDeckComplete(indices, slideCount);
  // A record is only "completed" once every slide is presented; older data has no completedAt.
  if (complete) {
    return {
      deckId,
      slideIndex,
      presented: indices,
      updatedAt,
      completedAt: isFiniteNumber(completedAt) ? completedAt : updatedAt,
    };
  }
  return { deckId, slideIndex, presented: indices, updatedAt };
}

export function isProgressComplete(progress: DeckProgress): boolean {
  return progress.completedAt !== undefined;
}

/**
 * Resumable progress only: like `parseStoredProgress`, but a completed deck has nothing to
 * resume (the user starts over), so it returns null.
 */
export function parseProgress(
  raw: string | null,
  deckId: string,
  slideCount: number,
): DeckProgress | null {
  const progress = parseStoredProgress(raw, deckId, slideCount);
  return progress && !isProgressComplete(progress) ? progress : null;
}

/** Panel view of a deck's stored progress. */
export function summarizeProgress(
  raw: string | null,
  deckId: string,
  slideCount: number,
): DeckProgressSummary {
  const progress = parseStoredProgress(raw, deckId, slideCount);
  if (!progress) {
    return {
      status: "not_started",
      presentedCount: 0,
      slideCount,
      resumeIndex: null,
      updatedAt: null,
      completedAt: null,
      progress: null,
    };
  }
  const completed = isProgressComplete(progress);
  return {
    status: completed ? "completed" : "in_progress",
    presentedCount: progress.presented.length,
    slideCount,
    resumeIndex: completed ? null : resumeSlideIndex(progress, slideCount),
    updatedAt: progress.updatedAt,
    completedAt: progress.completedAt ?? null,
    progress: completed ? null : progress,
  };
}

/**
 * The record to store for a live position: marks it completed once every slide is presented,
 * keeping an earlier `completedAt` so repeated saves don't move the completion time.
 * Returns null when there is nothing worth saving.
 */
export function nextProgressRecord(
  previous: DeckProgress | null,
  deckId: string,
  slideCount: number,
  slideIndex: number,
  presented: number[],
  now: number,
): DeckProgress | null {
  if (isDeckComplete(presented, slideCount)) {
    const completedAt =
      previous && previous.completedAt !== undefined ? previous.completedAt : now;
    return { deckId, slideIndex, presented, updatedAt: now, completedAt };
  }
  if (!hasProgress(slideIndex, presented)) return null;
  return { deckId, slideIndex, presented, updatedAt: now };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** Epoch ms -> "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function formatRelativeTime(epochMs: number, now: number, locale?: string): string {
  const diffSec = Math.round((epochMs - now) / 1000);
  if (Math.abs(diffSec) < 45) return "just now";
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diffSec) >= seconds) return formatter.format(Math.round(diffSec / seconds), unit);
  }
  return formatter.format(Math.round(diffSec / 60) || -1, "minute");
}

/**
 * The slide to continue from: the saved slide if it wasn't finished, otherwise the next
 * unpresented slide after it (wrapping to the first unpresented one).
 */
export function resumeSlideIndex(progress: DeckProgress, slideCount: number): number {
  const done = new Set(progress.presented);
  if (!done.has(progress.slideIndex)) return progress.slideIndex;
  for (let step = 1; step < slideCount; step += 1) {
    const index = (progress.slideIndex + step) % slideCount;
    if (!done.has(index)) return index;
  }
  return progress.slideIndex;
}

export function toResumeRequest(progress: DeckProgress, slideCount: number): ResumeRequest {
  return { slideIndex: resumeSlideIndex(progress, slideCount), presented: progress.presented };
}

// Storage can be unavailable (private mode, blocked site data, quota): every access is guarded
// so progress is a convenience that never breaks the app.

export function readStoredProgress(deckId: string): string | null {
  try {
    return window.localStorage.getItem(progressKey(deckId));
  } catch {
    return null;
  }
}

function notifyChange(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveProgress(progress: DeckProgress): void {
  try {
    window.localStorage.setItem(progressKey(progress.deckId), JSON.stringify(progress));
    notifyChange();
  } catch {
    // Not persisted; the user simply won't be offered a resume.
  }
}

export function clearProgress(deckId: string): void {
  try {
    window.localStorage.removeItem(progressKey(deckId));
    notifyChange();
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** Calls `onChange` whenever saved progress may have changed, in this tab or another. */
export function subscribeToProgress(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
