"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  parseReports,
  readStoredReports,
  subscribeToReports,
  type SavedReport,
} from "@/lib/report-history";

const noStoredValue = () => null;

/** Saved past-session reports, newest first (empty on the server or without storage). */
export function useReportHistory<T = unknown>(
  parseTranscriptItem?: (item: unknown) => T | null,
): SavedReport<T>[] {
  // The raw string is the snapshot: it compares by value, so unrelated changes don't re-render.
  const raw = useSyncExternalStore(subscribeToReports, readStoredReports, noStoredValue);
  return useMemo(() => parseReports(raw, parseTranscriptItem), [raw, parseTranscriptItem]);
}
