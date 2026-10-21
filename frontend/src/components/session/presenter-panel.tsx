"use client";

import { BarVisualizer, useAgent, type ReceivedMessage } from "@livekit/components-react";
import { AgentStatus } from "@/components/session/agent-status";
import { Transcript } from "@/components/session/transcript";
import { Card } from "@/components/ui/card";
import type { Presenter } from "@/lib/types";

function initials(name: string): string {
  return name
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export interface PresenterPanelProps {
  presenter: Presenter;
  messages: ReceivedMessage[];
}

export function PresenterPanel({ presenter, messages }: PresenterPanelProps) {
  const agent = useAgent();

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4 border-b border-line p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-violet))] text-sm font-semibold text-white"
            >
              {initials(presenter.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{presenter.name}</p>
              <p className="truncate text-sm text-ink-muted">{presenter.role}</p>
            </div>
          </div>
          <AgentStatus state={agent.state} />
        </div>
        <div aria-hidden className="h-12 rounded-xl bg-canvas py-2.5">
          <BarVisualizer
            state={agent.state}
            track={agent.microphoneTrack}
            barCount={7}
            options={{ minHeight: 12 }}
            className="h-full"
          />
        </div>
      </div>
      <Transcript presenterName={presenter.name} messages={messages} />
    </Card>
  );
}
