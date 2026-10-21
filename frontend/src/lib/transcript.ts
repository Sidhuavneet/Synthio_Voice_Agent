import type { TimelineEntry } from "@/hooks/use-agent-events";

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
