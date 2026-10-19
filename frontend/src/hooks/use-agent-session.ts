"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { TokenSource } from "livekit-client";
import { useSession, type UseSessionReturn } from "@livekit/components-react";
import { toErrorMessage } from "@/lib/errors";
import { describeMicrophoneError } from "@/lib/media-errors";
import type { ConnectionDetails } from "@/lib/types";

const AGENT_CONNECT_TIMEOUT_MS = 30_000;

export interface AgentSessionError {
  kind: "microphone" | "connection";
  message: string;
}

/**
 * Connects to the LiveKit room described by `connection` with the microphone on,
 * and disconnects on unmount. The agent is dispatched by the token's room configuration.
 */
export function useAgentSession(connection: ConnectionDetails): {
  session: UseSessionReturn;
  error: AgentSessionError | null;
  setMicrophoneError: (message: string | null) => void;
} {
  const tokenSource = useMemo(
    () =>
      TokenSource.literal({
        serverUrl: connection.serverUrl,
        participantToken: connection.participantToken,
      }),
    [connection.serverUrl, connection.participantToken],
  );
  const session = useSession(tokenSource, {
    agentConnectTimeoutMilliseconds: AGENT_CONNECT_TIMEOUT_MS,
  });
  const [error, setError] = useState<AgentSessionError | null>(null);

  const startSession = useEffectEvent((signal: AbortSignal) => session.start({ signal }));
  // Enabled alongside (not inside) session.start so a microphone failure can't mask a
  // connection failure; the pre-connect buffer still captures speech before the agent joins.
  const enableMicrophone = useEffectEvent(() =>
    session.room.localParticipant.setMicrophoneEnabled(true, undefined, {
      preConnectBuffer: true,
    }),
  );
  const endSession = useEffectEvent(() => session.end());

  useEffect(() => {
    const controller = new AbortController();
    // Defer one tick so React Strict Mode's mount/unmount/mount never connects twice
    // (an agent won't rejoin a room that already existed).
    const timer = window.setTimeout(() => {
      startSession(controller.signal).catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError({ kind: "connection", message: toErrorMessage(err) });
      });
      enableMicrophone().catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = describeMicrophoneError(err) ?? "The microphone couldn't be started.";
        // A connection error takes precedence: it explains why the session can't continue.
        setError((prev) => (prev?.kind === "connection" ? prev : { kind: "microphone", message }));
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      void endSession();
    };
  }, []);

  const setMicrophoneError = useCallback((message: string | null) => {
    setError((prev) => {
      if (message) return { kind: "microphone", message };
      return prev?.kind === "microphone" ? null : prev;
    });
  }, []);

  return { session, error, setMicrophoneError };
}
