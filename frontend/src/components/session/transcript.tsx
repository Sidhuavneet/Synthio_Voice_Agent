"use client";

import { useEffect, useRef } from "react";
import { CornerDownRight, Hand, Undo2 } from "lucide-react";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import { cn } from "@/lib/cn";
import { formatLatency } from "@/lib/format";
import { slideLabel, type TranscriptRow } from "@/lib/transcript";
import type { Slide } from "@/lib/types";

/** Distance from the bottom (px) within which new messages keep the view pinned. */
const STICK_THRESHOLD_PX = 80;

export interface TranscriptProps {
  presenterName: string;
  /** Messages with slide changes and interruptions as markers between them. */
  rows: TranscriptRow[];
  slides: Slide[];
}

/** The live transcript: scrolls with the conversation unless the user scrolled up. */
export function Transcript({ presenterName, rows, slides }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

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
        <TranscriptList presenterName={presenterName} rows={rows} slides={slides} />
      )}
    </div>
  );
}

/** Transcript rows as shown in the session; also used by the report. */
export function TranscriptList({ presenterName, rows, slides }: TranscriptProps) {
  return (
    <ul className="space-y-4">
      {rows.map((row, i) => {
        if (row.kind === "marker") {
          return <Marker key={`marker-${i}`} entry={row.entry} slides={slides} />;
        }
        const msg = row.message;
        return (
          <li key={msg.id} className={cn("flex flex-col gap-1", msg.fromUser && "items-end")}>
            <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
              {msg.fromUser ? "You" : presenterName}
            </span>
            <p
              className={cn(
                "max-w-[90%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-pretty",
                msg.fromUser
                  ? "rounded-br-md bg-ink text-white"
                  : "rounded-bl-md bg-canvas text-ink-soft",
              )}
            >
              {msg.text}
            </p>
          </li>
        );
      })}
    </ul>
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
  const label = slideLabel(entry.toIndex, slides);
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
