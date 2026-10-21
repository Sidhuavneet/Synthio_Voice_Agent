"use client";

import { useCallback, useState } from "react";
import { useDataChannel } from "@livekit/components-react";
import { parseAgentEvent } from "@/lib/events";
import { EVENTS_TOPIC } from "@/lib/protocol";
import type { ComplianceFlag, SessionErrorEvent, TurnMetrics } from "@/lib/types";

export interface LatencyStats {
  latest: TurnMetrics | null;
  /** Mean `totalMs` over turns that reported one, or null before the first. */
  averageTotalMs: number | null;
  turnCount: number;
}

export interface AgentEvents {
  complianceFlags: ComplianceFlag[];
  latency: LatencyStats;
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
    }
  }, []);

  useDataChannel(EVENTS_TOPIC, handleMessage);

  return {
    complianceFlags,
    latency: {
      latest: totals.latest,
      averageTotalMs: totals.timedTurns > 0 ? totals.sumTotalMs / totals.timedTurns : null,
      turnCount: totals.turnCount,
    },
    sessionError,
  };
}
