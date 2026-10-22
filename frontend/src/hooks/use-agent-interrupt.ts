"use client";

import { useCallback } from "react";
import { useAgent, useSessionContext } from "@livekit/components-react";
import { INTERRUPT_RPC_METHOD } from "@/lib/protocol";

/** Asks the agent to stop talking via the `agent.interrupt` RPC (contract §5). */
export function useAgentInterrupt(): () => Promise<void> {
  const { room } = useSessionContext();
  const agentIdentity: string | undefined = useAgent().identity;

  return useCallback(async () => {
    if (!agentIdentity) return;
    try {
      await room.localParticipant.performRpc({
        destinationIdentity: agentIdentity,
        method: INTERRUPT_RPC_METHOD,
        payload: "{}",
      });
    } catch {
      // Best effort: with the mic open, speaking over the agent still interrupts it.
    }
  }, [agentIdentity, room]);
}
