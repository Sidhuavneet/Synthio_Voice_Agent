"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReceivedMessage } from "@livekit/components-react";
import { CornerDownRight, Hand, Undo2 } from "lucide-react";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import { cn } from "@/lib/cn";
import { formatLatency } from "@/lib/format";
import { mergeRows } from "@/lib/transcript";
import type { Slide } from "@/lib/types";

/** Distance from the bottom (px) within which new messages keep the view pinned. */
const STICK_THRESHOLD_PX = 80;

export interface TranscriptProps {
  presenterName: string;
  messages: ReceivedMessage[];
  /** Slide changes and interruptions, shown as markers between messages. */
  timeline: TimelineEntry[];
  slides: Slide[];
}

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

export function Transcript({ presenterName, messages, timeline, slides }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const entriesBefore = useEntriesBefore(messages, timeline.length);
  const rows = useMemo(() => {
    const before = (message: ReceivedMessage) => entriesBefore.get(message.id) ?? timeline.length;
    return mergeRows(messages, before, timeline);
  }, [messages, entriesBefore, timeline]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      role="log"
      aria-label="Conversation transcript"
      className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
    >
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          The conversation will appear here as you talk.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row, i) => {
            if (row.kind === "marker") {
              return <Marker key={`marker-${i}`} entry={row.entry} slides={slides} />;
            }
            const msg = row.message;
            const isUser = msg.from?.isLocal === true;
            return (
              <li key={msg.id} className={cn("flex flex-col gap-1", isUser && "items-end")}>
                <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                  {isUser ? "You" : presenterName}
                </span>
                <p
                  className={cn(
                    "max-w-[90%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-pretty",
                    isUser
                      ? "rounded-br-md bg-ink text-white"
                      : "rounded-bl-md bg-canvas text-ink-soft",
                  )}
                >
                  {msg.message}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Marker({ entry, slides }: { entry: TimelineEntry; slides: Slide[] }) {
  if (entry.type === "interruption") {
    return (
      <li className="flex items-center justify-end gap-1.5 text-[11px] text-ink-muted">
        <Hand aria-hidden className="size-3" />
        You cut in · detected in {formatLatency(entry.detectionMs)}
      </li>
    );
  }
  const slide = slides[entry.toIndex];
  const label = `Slide ${entry.toIndex + 1}${slide ? ` · ${slide.title}` : ""}`;
  if (entry.trigger === "question") {
    return (
      <li className="flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-strong">
        <CornerDownRight aria-hidden className="mt-px size-3.5 shrink-0" />
        <span className="min-w-0 text-pretty">
          <span className="font-semibold">Jumped to {label}</span>
          {entry.reason && <span className="text-ink-soft"> to answer: {entry.reason}</span>}
        </span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {entry.trigger === "resume" && <Undo2 aria-hidden className="size-3" />}
      <span className="truncate">{entry.trigger === "resume" ? `Back to ${label}` : label}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </li>
  );
}
