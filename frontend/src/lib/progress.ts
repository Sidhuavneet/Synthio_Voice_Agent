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
 * Validates a stored value against the deck it should belong to. Returns null for malformed,
 * foreign, out-of-range, empty or already-complete progress.
 */
export function parseProgress(
  raw: string | null,
  deckId: string,
  slideCount: number,
): DeckProgress | null {
  if (raw === null) return null;
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const { deckId: storedId, slideIndex, presented, updatedAt } = value;
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
  if (!hasProgress(slideIndex, indices) || isDeckComplete(indices, slideCount)) return null;
  return { deckId, slideIndex, presented: indices, updatedAt };
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
