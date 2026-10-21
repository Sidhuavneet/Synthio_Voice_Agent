"use client";

import { useEffect, useRef } from "react";
import type { ReceivedMessage } from "@livekit/components-react";
import { cn } from "@/lib/cn";

/** Distance from the bottom (px) within which new messages keep the view pinned. */
const STICK_THRESHOLD_PX = 80;

export interface TranscriptProps {
  presenterName: string;
  messages: ReceivedMessage[];
}

export function Transcript({ presenterName, messages }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      {messages.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          The conversation will appear here as you talk.
        </p>
      ) : (
        <ul className="space-y-4">
          {messages.map((msg) => {
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
