/** Opening the report by itself once the presentation is over (contract §6). */

/** Quiet time after the wrap-up before the report opens. */
export const AUTO_REPORT_DELAY_MS = 10_000;

/**
 * `inactive`: the presentation isn't finished. `paused`: finished, but someone is talking.
 * `counting`: finished and quiet, so the countdown runs. `cancelled`: the user chose to stay.
 */
export type AutoReportPhase = "inactive" | "paused" | "counting" | "cancelled";

export function autoReportPhase({
  finished,
  quiet,
  cancelled,
}: {
  finished: boolean;
  quiet: boolean;
  cancelled: boolean;
}): AutoReportPhase {
  if (!finished) return "inactive";
  if (cancelled) return "cancelled";
  return quiet ? "counting" : "paused";
}

/** Whole seconds left in a countdown of `delayMs` started at `startedAt`, never negative. */
export function countdownSeconds(startedAt: number, now: number, delayMs: number): number {
  return Math.max(0, Math.ceil((delayMs - (now - startedAt)) / 1000));
}
