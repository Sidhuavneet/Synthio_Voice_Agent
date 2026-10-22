"use client";

import { useCallback, useState } from "react";
import { readMicMode, saveMicMode, type MicMode } from "@/lib/mic-mode";

/** The remembered microphone mode (localStorage), defaulting to open mic. */
export function useMicMode(): [MicMode, (mode: MicMode) => void] {
  // The session view only renders after the user picked a deck, so this never runs during
  // server rendering or hydration.
  const [mode, setMode] = useState<MicMode>(readMicMode);
  const update = useCallback((next: MicMode) => {
    setMode(next);
    saveMicMode(next);
  }, []);
  return [mode, update];
}
