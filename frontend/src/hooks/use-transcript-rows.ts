"use client";

import { useMemo, useState } from "react";
import type { ReceivedMessage } from "@livekit/components-react";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import { mergeRows, type TranscriptMessage, type TranscriptRow } from "@/lib/transcript";

/**
 * How many timeline entries had arrived when each message was first seen, which places it
 * among the markers. Recorded during render (no effect) so a new message is placed in the
 * same render it appears.
 */
function useEntriesBefore(
  messages: ReceivedMessage[],
  timelineLength: number,
): ReadonlyMap<string, number> {
  const [seen, setSeen] = useState<ReadonlyMap<string, number>>(() => new Map());
  const unseen = messages.filter((message) => !seen.has(message.id));
  if (unseen.length > 0) {
    const placed = unseen.map((message) => [message.id, timelineLength] as const);
    setSeen(new Map([...seen, ...placed]));
  }
  return seen;
}

function toTranscriptMessage(message: ReceivedMessage): TranscriptMessage {
  return { id: message.id, fromUser: message.from?.isLocal === true, text: message.message };
}

/** The session transcript: messages and timeline markers in arrival order. */
export function useTranscriptRows(
  messages: ReceivedMessage[],
  timeline: TimelineEntry[],
): TranscriptRow[] {
  const entriesBefore = useEntriesBefore(messages, timeline.length);
  return useMemo(() => {
    const before = (message: TranscriptMessage) =>
      entriesBefore.get(message.id) ?? timeline.length;
    return mergeRows(messages.map(toTranscriptMessage), before, timeline);
  }, [messages, entriesBefore, timeline]);
}
