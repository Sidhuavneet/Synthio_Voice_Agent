"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { TokenSource } from "livekit-client";
import { useSession, type UseSessionReturn } from "@livekit/components-react";
import { toErrorMessage } from "@/lib/errors";
import { describeMicrophoneError } from "@/lib/media-errors";
import type { MicMode } from "@/lib/mic-mode";
import type { ConnectionDetails } from "@/lib/types";

// The first job on a cold agent worker can take 30 s or more to start on a busy machine, and
// useAgent never clears a "joined but did not complete initializing" failure once it fires.
const AGENT_CONNECT_TIMEOUT_MS = 60_000;

export interface AgentSessionError {
  kind: "microphone" | "connection";
  message: string;
}

/**
 * Connects to the LiveKit room described by `connection` with the microphone on (muted in
 * tap-to-speak mode), and disconnects on unmount. The agent is dispatched by the token's room
 * configuration.
 */
export function useAgentSession(
  connection: ConnectionDetails,
  micMode: MicMode,
): {
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

  // session.start enables the microphone by default; opt out so it is enabled exactly once
  // below. A second concurrent enable waits on the first one's pending publication and stalls
  // the room connection by up to 20 s.
  const startSession = useEffectEvent((signal: AbortSignal) =>
    session.start({ signal, tracks: { microphone: { enabled: false } } }),
  );
  // Enabled alongside (not inside) session.start so a microphone failure can't mask a
  // connection failure; the pre-connect buffer still captures speech before the agent joins.
  // Tap to speak starts muted, but the mic is still enabled first: permission is asked up front
  // and the published track unmutes at once on the first tap.
  const enableMicrophone = useEffectEvent(async () => {
    const participant = session.room.localParticipant;
    await participant.setMicrophoneEnabled(true, undefined, { preConnectBuffer: true });
    if (micMode === "tap") await participant.setMicrophoneEnabled(false);
  });
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
