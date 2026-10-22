/** Microphone modes (contract §5, "Frontend-only: microphone mode"). */

/** `open`: the mic is on and the user can speak anytime. `tap`: muted until the user taps. */
export type MicMode = "open" | "tap";

export const MIC_MODES: readonly MicMode[] = ["open", "tap"];
export const DEFAULT_MIC_MODE: MicMode = "open";
export const MIC_MODE_KEY = "synthio.micMode";
/** Longest a tap-to-speak turn keeps the mic open before it mutes by itself. */
export const TAP_LISTEN_MAX_MS = 30_000;

export function parseMicMode(raw: string | null): MicMode {
  return raw === "open" || raw === "tap" ? raw : DEFAULT_MIC_MODE;
}

// Storage can be unavailable (private mode, blocked site data): the setting then simply
// isn't remembered.

export function readMicMode(): MicMode {
  try {
    return parseMicMode(window.localStorage.getItem(MIC_MODE_KEY));
  } catch {
    return DEFAULT_MIC_MODE;
  }
}

export function saveMicMode(mode: MicMode): void {
  try {
    window.localStorage.setItem(MIC_MODE_KEY, mode);
  } catch {
    // Not persisted; the next session starts in the default mode.
  }
}
