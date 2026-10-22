"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { Track } from "livekit-client";
import { useAgent, useTrackToggle } from "@livekit/components-react";
import { useAgentInterrupt } from "@/hooks/use-agent-interrupt";
import { describeMicrophoneError } from "@/lib/media-errors";
import { TAP_LISTEN_MAX_MS, type MicMode } from "@/lib/mic-mode";

export interface MicControl {
  /** The microphone is unmuted. */
  enabled: boolean;
  /** A mute/unmute is in flight. */
  pending: boolean;
  /** Tap to speak: the mic is open for the user's turn. */
  listening: boolean;
  /** Open mic: mutes or unmutes. */
  toggleMute: () => void;
  /** Tap to speak: interrupts the agent and opens the mic, or closes it again. */
  tap: () => void;
  /** Switches mode: tap to speak mutes at once, open mic unmutes. */
  changeMode: (mode: MicMode) => void;
}

/**
 * Microphone behaviour for both modes (contract §5, "Frontend-only: microphone mode"). In tap
 * to speak the mic also closes by itself once the agent starts thinking (the user's turn was
 * committed) or after the listen window.
 */
export function useMicControl(
  mode: MicMode,
  onModeChange: (mode: MicMode) => void,
  onMicrophoneError: (message: string | null) => void,
): MicControl {
  const { enabled, pending, toggle } = useTrackToggle({
    source: Track.Source.Microphone,
    onDeviceError: (error) =>
      onMicrophoneError(describeMicrophoneError(error) ?? "The microphone couldn't be started."),
  });
  const agentState = useAgent().state;
  const interrupt = useAgentInterrupt();
  const listening = mode === "tap" && enabled;

  const setMicrophone = (on: boolean) => {
    if (on) onMicrophoneError(null);
    void toggle(on);
  };
  const closeMicrophone = useEffectEvent(() => setMicrophone(false));

  // Only a change into "thinking" ends the turn: the agent may still be thinking about an
  // earlier turn at the moment of the tap.
  const previousState = useRef(agentState);
  useEffect(() => {
    const previous = previousState.current;
    previousState.current = agentState;
    if (listening && agentState === "thinking" && previous !== "thinking") closeMicrophone();
  }, [agentState, listening]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setTimeout(() => closeMicrophone(), TAP_LISTEN_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [listening]);

  return {
    enabled,
    pending,
    listening,
    toggleMute: () => setMicrophone(!enabled),
    tap: () => {
      if (listening) {
        setMicrophone(false);
        return;
      }
      // Both at once: the mic opens while the agent is being stopped.
      void interrupt();
      setMicrophone(true);
    },
    changeMode: (next) => {
      if (next === mode) return;
      onModeChange(next);
      setMicrophone(next === "open");
    },
  };
}
