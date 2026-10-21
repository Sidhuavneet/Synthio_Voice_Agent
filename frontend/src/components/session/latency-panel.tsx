import { Gauge } from "lucide-react";
import type { LatencyStats } from "@/hooks/use-agent-events";
import { cn } from "@/lib/cn";
import { formatLatency } from "@/lib/format";
import type { TurnMetrics } from "@/lib/types";

interface Stage {
  key: "eouMs" | "llmTtftMs" | "ttsTtfbMs";
  label: string;
  description: string;
  color: string;
}

// Together these make up `totalMs` (contract §5).
const STAGES: Stage[] = [
  {
    key: "eouMs",
    label: "STT/EOU",
    description: "Speech-to-text finalisation and end-of-utterance delay",
    color: "bg-accent-light",
  },
  { key: "llmTtftMs", label: "LLM", description: "LLM time to first token", color: "bg-accent" },
  { key: "ttsTtfbMs", label: "TTS", description: "TTS time to first byte", color: "bg-violet" },
];

function stageTitle(stage: Stage, turn: TurnMetrics): string {
  const value = `${stage.description}: ${formatLatency(turn[stage.key])}`;
  return stage.key === "eouMs" && turn.sttMs !== null
    ? `${value} (STT ${formatLatency(turn.sttMs)})`
    : value;
}

/** Voice-to-voice latency of the last agent reply, its breakdown, and the session average. */
export function LatencyPanel({ latency }: { latency: LatencyStats }) {
  const { latest, averageTotalMs, turnCount } = latency;
  const segmentTotal = latest
    ? STAGES.reduce((sum, stage) => sum + (latest[stage.key] ?? 0), 0)
    : 0;

  return (
    <section aria-labelledby="latency-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="latency-heading"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          <Gauge aria-hidden className="size-3.5" />
          Response latency
        </h2>
        {averageTotalMs !== null && (
          <span className="text-xs text-ink-muted tabular-nums">
            avg {formatLatency(averageTotalMs)} · {turnCount} {turnCount === 1 ? "turn" : "turns"}
          </span>
        )}
      </div>

      {latest ? (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
              {formatLatency(latest.totalMs)}
            </span>
            <span className="text-xs text-ink-muted">last reply</span>
          </div>
          {segmentTotal > 0 && (
            <div aria-hidden className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-canvas">
              {STAGES.map((stage) => {
                const value = latest[stage.key];
                if (!value) return null;
                return (
                  <span
                    key={stage.key}
                    className={cn("h-full rounded-full transition-[width] duration-500", stage.color)}
                    style={{ width: `${(value / segmentTotal) * 100}%` }}
                  />
                );
              })}
            </div>
          )}
          <dl className="grid grid-cols-3 gap-2 text-xs">
            {STAGES.map((stage) => (
              <div key={stage.key} title={stageTitle(stage, latest)} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-ink-muted">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", stage.color)} />
                  <span className="truncate">{stage.label}</span>
                </dt>
                <dd className="mt-0.5 font-medium text-ink-soft tabular-nums">
                  {formatLatency(latest[stage.key])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Measured after the presenter&apos;s first reply.</p>
      )}
    </section>
  );
}
