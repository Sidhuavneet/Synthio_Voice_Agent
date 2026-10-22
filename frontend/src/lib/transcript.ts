import type { TimelineEntry } from "@/hooks/use-agent-events";
import { formatLatency } from "@/lib/format";
import type { Slide } from "@/lib/types";

export type Row<M> = { kind: "message"; message: M } | { kind: "marker"; entry: TimelineEntry };

function isMarker(entry: TimelineEntry): boolean {
  return entry.type === "slide_changed" || entry.kind === "barge_in";
}

/**
 * Messages and timeline markers in arrival order. Timestamps are not compared: transcripts
 * carry the agent's clock and typed messages the browser's, so clock skew would misplace them.
 *
 * @param messages In arrival order.
 * @param entriesBefore How many timeline entries had arrived when the message was first seen.
 */
export function mergeRows<M>(
  messages: M[],
  entriesBefore: (message: M) => number,
  timeline: TimelineEntry[],
): Row<M>[] {
  const rows: Row<M>[] = [];
  let next = 0;
  const flushMarkers = (until: number) => {
    for (; next < Math.min(until, timeline.length); next++) {
      if (isMarker(timeline[next])) rows.push({ kind: "marker", entry: timeline[next] });
    }
  };
  for (const message of messages) {
    flushMarkers(entriesBefore(message));
    rows.push({ kind: "message", message });
  }
  flushMarkers(timeline.length);
  return rows;
}

/** A transcript message as shown in the session, detached from LiveKit's message objects. */
export interface TranscriptMessage {
  id: string;
  /** Said or typed by the user ("You"); otherwise by the presenter. */
  fromUser: boolean;
  text: string;
}

/** One row of the session transcript, as captured when the session ends. Plain JSON. */
export type TranscriptRow = Row<TranscriptMessage>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validates a row read back from storage; null when it isn't a transcript row. */
export function parseTranscriptRow(value: unknown): TranscriptRow | null {
  if (!isRecord(value)) return null;
  if (value.kind === "message" && isRecord(value.message)) {
    const { id, fromUser, text } = value.message;
    if (typeof id === "string" && typeof fromUser === "boolean" && typeof text === "string") {
      return { kind: "message", message: { id, fromUser, text } };
    }
  }
  if (value.kind === "marker" && isRecord(value.entry) && typeof value.entry.type === "string") {
    return { kind: "marker", entry: value.entry as unknown as TimelineEntry };
  }
  return null;
}

export function slideLabel(index: number, slides: readonly Pick<Slide, "title">[]): string {
  const slide = slides[index];
  return `Slide ${index + 1}${slide ? ` · ${slide.title}` : ""}`;
}

/** The text of a timeline marker, as the transcript shows it. */
export function markerText(entry: TimelineEntry, slides: readonly Pick<Slide, "title">[]): string {
  if (entry.type === "interruption") {
    return `You cut in · detected in ${formatLatency(entry.detectionMs)}`;
  }
  const label = slideLabel(entry.toIndex, slides);
  if (entry.trigger === "question") {
    return `Jumped to ${label}${entry.reason ? ` to answer: ${entry.reason}` : ""}`;
  }
  return entry.trigger === "resume" ? `Back to ${label}` : label;
}

/** Plain-text transcript, one row per line, with the speaker labels shown in the session. */
export function formatTranscript(
  rows: readonly TranscriptRow[],
  presenterName: string,
  slides: readonly Pick<Slide, "title">[],
): string {
  return rows
    .map((row) =>
      row.kind === "marker"
        ? `— ${markerText(row.entry, slides)} —`
        : `${row.message.fromUser ? "You" : presenterName}: ${row.message.text}`,
    )
    .join("\n");
}
