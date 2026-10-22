"use client";

import { useEffect, useState } from "react";

/**
 * True once `active` has stayed true for `ms` milliseconds; false again as soon as it turns
 * false. Used to swap a plain "loading" message for a slower-path explanation.
 */
export function useElapsedFlag(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  const [wasActive, setWasActive] = useState(active);

  // Reset during render (not in an effect) so a new active period never starts out elapsed.
  if (active !== wasActive) {
    setWasActive(active);
    setElapsed(false);
  }

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setElapsed(true), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);

  return active && elapsed;
}
