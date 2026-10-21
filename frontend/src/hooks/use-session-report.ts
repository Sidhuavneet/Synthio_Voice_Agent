"use client";

import { useCallback, useRef, useState } from "react";
import { useAgent, useSessionContext } from "@livekit/components-react";
import { toErrorMessage } from "@/lib/errors";
import { REPORT_RPC_METHOD, REPORT_RPC_TIMEOUT_MS } from "@/lib/protocol";
import { parseSessionReportResponse } from "@/lib/report";
import type { SessionFacts, SessionReport } from "@/lib/types";

export type ReportState =
  | { status: "idle" }
  | { status: "generating"; facts: SessionFacts }
  | { status: "ready"; report: SessionReport }
  | { status: "failed"; facts: SessionFacts; error: string };

/**
 * Ends the session with a report (contract §5–§6): asks the agent for `session.report`,
 * then disconnects. `getFacts` supplies the frontend's own facts, shown while the report is
 * generated and kept if it fails.
 */
export function useSessionReport(getFacts: () => SessionFacts): {
  state: ReportState;
  requestReport: () => Promise<void>;
} {
  const session = useSessionContext();
  const agent = useAgent();
  const agentIdentity: string | undefined = agent.identity;
  const [state, setState] = useState<ReportState>({ status: "idle" });
  const requested = useRef(false);

  const requestReport = useCallback(async () => {
    if (requested.current) return;
    requested.current = true;
    const facts = getFacts();
    setState({ status: "generating", facts });

    const { localParticipant } = session.room;
    // Stop listening so nothing the user says starts a new turn while the report is written.
    localParticipant.setMicrophoneEnabled(false).catch(() => {
      // Best effort: the session is disconnected right after the report anyway.
    });

    let next: ReportState;
    if (!agentIdentity) {
      next = { status: "failed", facts, error: "The presenter never joined this session." };
    } else {
      try {
        const raw = await localParticipant.performRpc({
          destinationIdentity: agentIdentity,
          method: REPORT_RPC_METHOD,
          payload: "{}",
          responseTimeout: REPORT_RPC_TIMEOUT_MS,
        });
        const response = parseSessionReportResponse(raw);
        next = response.ok
          ? { status: "ready", report: response }
          : { status: "failed", facts, error: response.error };
      } catch (err) {
        next = { status: "failed", facts, error: toErrorMessage(err) };
      }
    }

    // Show the report even if disconnecting fails: leaving the screen ends the session again.
    await session.end().catch(() => undefined);
    setState(next);
  }, [agentIdentity, getFacts, session]);

  return { state, requestReport };
}
