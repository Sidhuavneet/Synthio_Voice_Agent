"use client";

import { useCallback, useMemo, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { parseAgentEvent } from "@/lib/events";
import { EVENTS_TOPIC } from "@/lib/protocol";
import type {
  ComplianceFlag,
  Interruption,
  SessionErrorEvent,
  SlideChange,
  TurnMetrics,
} from "@/lib/types";

/** Slide changes and interruptions in arrival order: the story of the session. */
export type TimelineEntry =
  | ({ type: "slide_changed" } & SlideChange)
  | ({ type: "interruption" } & Interruption);

export interface InterruptionStats {
  bargeIns: number;
  /** Mean barge-in detection time, or null before the first. */
  averageDetectionMs: number | null;
  /** Overlaps the agent rightly talked through ("mhm", "right"). */
  backchannels: number;
}

export interface LatencyStats {
  latest: TurnMetrics | null;
  /** Mean `totalMs` over turns that reported one, or null before the first. */
  averageTotalMs: number | null;
  turnCount: number;
  interruptions: InterruptionStats;
}

export interface AgentEvents {
  complianceFlags: ComplianceFlag[];
  latency: LatencyStats;
  timeline: TimelineEntry[];
  /** Set when the agent reported an unrecoverable error (it leaves right after). */
  sessionError: SessionErrorEvent | null;
}

interface LatencyTotals {
  latest: TurnMetrics | null;
  turnCount: number;
  timedTurns: number;
  sumTotalMs: number;
}

const INITIAL_TOTALS: LatencyTotals = { latest: null, turnCount: 0, timedTurns: 0, sumTotalMs: 0 };

function interruptionStats(timeline: TimelineEntry[]): InterruptionStats {
  const interruptions = timeline.filter((entry) => entry.type === "interruption");
  const bargeIns = interruptions.filter((entry) => entry.kind === "barge_in");
  const totalMs = bargeIns.reduce((sum, entry) => sum + entry.detectionMs, 0);
  return {
    bargeIns: bargeIns.length,
    averageDetectionMs: bargeIns.length > 0 ? totalMs / bargeIns.length : null,
    backchannels: interruptions.length - bargeIns.length,
  };
}

function addTurn(totals: LatencyTotals, turn: TurnMetrics): LatencyTotals {
  if (totals.latest?.turnId === turn.turnId) return totals;
  const timed = turn.totalMs !== null;
  return {
    latest: turn,
    turnCount: totals.turnCount + 1,
    timedTurns: totals.timedTurns + (timed ? 1 : 0),
    sumTotalMs: totals.sumTotalMs + (turn.totalMs ?? 0),
  };
}

/** Collects the agent's `synthio.events` data packets (contract §5) for the current room. */
export function useAgentEvents(): AgentEvents {
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [totals, setTotals] = useState<LatencyTotals>(INITIAL_TOTALS);
  const [sessionError, setSessionError] = useState<SessionErrorEvent | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  // Must be stable: useDataChannel re-subscribes whenever the callback identity changes.
  const handleMessage = useCallback((message: { payload: Uint8Array }) => {
    const event = parseAgentEvent(message.payload);
    if (event?.type === "compliance_flag") {
      setComplianceFlags((prev) =>
        prev.some((flag) => flag.id === event.id) ? prev : [...prev, event],
      );
    } else if (event?.type === "turn_metrics") {
      setTotals((prev) => addTurn(prev, event));
    } else if (event?.type === "session_error") {
      setSessionError({ code: event.code, message: event.message });
    } else if (event?.type === "slide_changed" || event?.type === "interruption") {
      setTimeline((prev) => [...prev, event]);
    }
  }, []);

  useDataChannel(EVENTS_TOPIC, handleMessage);
  const interruptions = useMemo(() => interruptionStats(timeline), [timeline]);

  return {
    complianceFlags,
    latency: {
      latest: totals.latest,
      averageTotalMs: totals.timedTurns > 0 ? totals.sumTotalMs / totals.timedTurns : null,
      turnCount: totals.turnCount,
      interruptions,
    },
    timeline,
    sessionError,
  };
}
