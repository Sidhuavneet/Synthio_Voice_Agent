"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  AUTO_REPORT_DELAY_MS,
  autoReportPhase,
  countdownSeconds,
  type AutoReportPhase,
} from "@/lib/auto-report";

const TICK_MS = 250;

export interface AutoReport {
  phase: AutoReportPhase;
  /** Seconds left while `counting`. */
  secondsLeft: number;
  /** Cancels the countdown for the rest of the session. */
  stay: () => void;
}

/**
 * Calls `onOpen` once the presentation has finished and the room has stayed quiet for
 * `AUTO_REPORT_DELAY_MS`. Anyone talking pauses the countdown, which restarts from the full
 * delay when the room is quiet again, unless the user chose to stay.
 */
export function useAutoReport(finished: boolean, quiet: boolean, onOpen: () => void): AutoReport {
  const [cancelled, setCancelled] = useState(false);
  const phase = autoReportPhase({ finished, quiet, cancelled });
  const fullSeconds = AUTO_REPORT_DELAY_MS / 1000;
  const [secondsLeft, setSecondsLeft] = useState(fullSeconds);
  const [lastPhase, setLastPhase] = useState(phase);

  // Reset during render (not in an effect) so a restarted countdown never shows a stale value.
  if (phase !== lastPhase) {
    setLastPhase(phase);
    setSecondsLeft(fullSeconds);
  }

  const open = useEffectEvent(onOpen);

  useEffect(() => {
    if (phase !== "counting") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const left = countdownSeconds(startedAt, Date.now(), AUTO_REPORT_DELAY_MS);
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(timer);
        open();
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  return { phase, secondsLeft, stay: () => setCancelled(true) };
}
