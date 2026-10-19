"use client";

import { useCallback, useEffect, useState } from "react";
import { useAgent, useSessionContext } from "@livekit/components-react";
import { toErrorMessage } from "@/lib/errors";
import { NAVIGATE_RPC_METHOD } from "@/lib/protocol";
import type { NavigateRequest, NavigateResponse } from "@/lib/types";

const ERROR_VISIBLE_MS = 5_000;

function parseNavigateResponse(raw: string): NavigateResponse {
  try {
    const value = JSON.parse(raw) as Partial<Record<"ok" | "index" | "error", unknown>> | null;
    if (value?.ok === true && typeof value.index === "number") {
      return { ok: true, index: value.index };
    }
    if (value?.ok === false && typeof value.error === "string") {
      return { ok: false, error: value.error };
    }
  } catch {
    // Fall through to the generic error below.
  }
  return { ok: false, error: "The presenter sent an unexpected response." };
}

export interface SlideNavigation {
  navigate: (index: number) => Promise<void>;
  /** Slide index of the in-flight request, if any. */
  pendingIndex: number | null;
  error: string | null;
  canNavigate: boolean;
}

/** Asks the agent to change slides via the `slides.navigate` RPC (contract §5). */
export function useSlideNavigation(): SlideNavigation {
  const { room } = useSessionContext();
  const agent = useAgent();
  const agentIdentity: string | undefined = agent.identity;
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), ERROR_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  const navigate = useCallback(
    async (index: number) => {
      if (!agentIdentity) {
        setError("The presenter hasn't joined yet.");
        return;
      }
      setPendingIndex(index);
      setError(null);
      try {
        const payload: NavigateRequest = { index };
        const raw = await room.localParticipant.performRpc({
          destinationIdentity: agentIdentity,
          method: NAVIGATE_RPC_METHOD,
          payload: JSON.stringify(payload),
        });
        const response = parseNavigateResponse(raw);
        if (!response.ok) setError(response.error);
      } catch (err) {
        setError(`Couldn't change slides: ${toErrorMessage(err)}`);
      } finally {
        setPendingIndex(null);
      }
    },
    [agentIdentity, room],
  );

  return {
    navigate,
    pendingIndex,
    error,
    // The agent registers its RPC handler before it starts listening.
    canNavigate: agent.isConnected,
  };
}
