"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  nextProgressRecord,
  parseProgress,
  parseStoredProgress,
  readStoredProgress,
  saveProgress,
  subscribeToProgress,
  summarizeProgress,
  type DeckProgress,
  type DeckProgressSummary,
} from "@/lib/progress";

const noStoredValue = () => null;

/** The deck's raw stored progress string; compares by value, so unrelated changes don't re-render. */
function useStoredProgress(deckId: string): string | null {
  return useSyncExternalStore(subscribeToProgress, () => readStoredProgress(deckId), noStoredValue);
}

/**
 * The deck's saved, resumable progress (null on the server, when absent, when invalid, or when
 * the deck was completed — a completed deck is started over, not resumed).
 */
export function useSavedProgress(deckId: string, slideCount: number): DeckProgress | null {
  const raw = useStoredProgress(deckId);
  return useMemo(() => parseProgress(raw, deckId, slideCount), [raw, deckId, slideCount]);
}

/** Status, counts and timestamps for the progress panel. */
export function useDeckProgressSummary(deckId: string, slideCount: number): DeckProgressSummary {
  const raw = useStoredProgress(deckId);
  return useMemo(() => summarizeProgress(raw, deckId, slideCount), [raw, deckId, slideCount]);
}

/**
 * Saves the live session's position whenever the agent's `slide.index` / `slide.presented`
 * change, and marks the record completed once every slide has been presented.
 */
export function useDeckProgress(
  deckId: string,
  slideCount: number,
  { index, isSynced, presented }: { index: number; isSynced: boolean; presented: number[] },
): void {
  useEffect(() => {
    if (!isSynced) return;
    const previous = parseStoredProgress(readStoredProgress(deckId), deckId, slideCount);
    const record = nextProgressRecord(previous, deckId, slideCount, index, presented, Date.now());
    if (record) saveProgress(record);
  }, [deckId, slideCount, index, isSynced, presented]);
}
