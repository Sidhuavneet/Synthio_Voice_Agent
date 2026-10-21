import type { ComplianceCategory } from "@/lib/types";

const ACRONYMS = new Set(["acl", "hcp", "msl", "mrna"]);

/** "sports-medicine" -> "Sports medicine", "hcp-engagement" -> "HCP engagement" */
export function formatCategory(category: string): string {
  const sentence = category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()))
    .join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  off_label: "Off-label",
  personal_medical_advice: "Medical advice",
  adverse_event: "Adverse event",
  out_of_scope: "Out of scope",
};

/** 840 -> "840 ms", 1530 -> "1.53 s", null -> "—" */
export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** 41 -> "41s", 312 -> "5m 12s", 3720 -> "1h 2m" */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** Epoch ms -> locale time of day, e.g. "3:42 PM". */
export function formatTimeOfDay(epochMs: number): string {
  return timeFormatter.format(epochMs);
}
