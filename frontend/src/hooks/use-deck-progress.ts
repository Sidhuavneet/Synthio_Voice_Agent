"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  clearProgress,
  hasProgress,
  isDeckComplete,
  parseProgress,
  readStoredProgress,
  saveProgress,
  subscribeToProgress,
  type DeckProgress,
} from "@/lib/progress";

const noStoredValue = () => null;

/** The deck's saved, resumable progress (null on the server, when absent, or when invalid). */
export function useSavedProgress(deckId: string, slideCount: number): DeckProgress | null {
  // The raw string is the snapshot: it compares by value, so unrelated changes don't re-render.
  const raw = useSyncExternalStore(
    subscribeToProgress,
    () => readStoredProgress(deckId),
    noStoredValue,
  );
  return useMemo(() => parseProgress(raw, deckId, slideCount), [raw, deckId, slideCount]);
}

/**
 * Saves the live session's position whenever the agent's `slide.index` / `slide.presented`
 * change, and clears it once every slide has been presented.
 */
export function useDeckProgress(
  deckId: string,
  slideCount: number,
  { index, isSynced, presented }: { index: number; isSynced: boolean; presented: number[] },
): void {
  useEffect(() => {
    if (!isSynced) return;
    if (isDeckComplete(presented, slideCount)) {
      clearProgress(deckId);
    } else if (hasProgress(index, presented)) {
      saveProgress({ deckId, slideIndex: index, presented, updatedAt: Date.now() });
    }
  }, [deckId, slideCount, index, isSynced, presented]);
}
