import type { AgentState } from "@livekit/components-react";
import { cn } from "@/lib/cn";

type StatusTone = "idle" | "live" | "busy" | "error";

const STATUS: Record<AgentState, { label: string; tone: StatusTone }> = {
  disconnected: { label: "Disconnected", tone: "error" },
  connecting: { label: "Connecting", tone: "busy" },
  "pre-connect-buffering": { label: "Connecting", tone: "busy" },
  initializing: { label: "Getting ready", tone: "busy" },
  idle: { label: "Idle", tone: "idle" },
  listening: { label: "Listening", tone: "live" },
  thinking: { label: "Thinking", tone: "busy" },
  speaking: { label: "Speaking", tone: "live" },
  failed: { label: "Unavailable", tone: "error" },
};

const dotClasses: Record<StatusTone, string> = {
  idle: "bg-ink-muted",
  live: "bg-success",
  busy: "bg-accent animate-pulse",
  error: "bg-danger",
};

export function AgentStatus({ state }: { state: AgentState }) {
  const { label, tone } = STATUS[state];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-line ring-inset">
      <span aria-hidden className={cn("size-2 rounded-full", dotClasses[tone])} />
      {label}
    </span>
  );
}
