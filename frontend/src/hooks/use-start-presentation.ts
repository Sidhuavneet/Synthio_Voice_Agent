"use client";

import { useCallback, useState } from "react";
import { ApiError, createSession, getDeck } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import type { ConnectionDetails, Deck } from "@/lib/types";

export interface Presentation {
  deck: Deck;
  connection: ConnectionDetails;
}

export interface StartError {
  deckId: string;
  title: string;
  message: string;
}

function describeStartError(error: unknown): Omit<StartError, "deckId"> {
  if (error instanceof ApiError && error.isServiceUnavailable) {
    return {
      title: "Voice service not configured",
      message: `${error.message}. Add LiveKit credentials to backend/.env and restart the API.`,
    };
  }
  if (error instanceof ApiError && error.status === 404) {
    return { title: "Deck not found", message: error.message };
  }
  return {
    title: "Couldn't start the presentation",
    message: toErrorMessage(error),
  };
}

/** Loads the full deck and requests LiveKit connection details for it. */
export function useStartPresentation() {
  const [pendingDeckId, setPendingDeckId] = useState<string | null>(null);
  const [error, setError] = useState<StartError | null>(null);

  const start = useCallback(async (deckId: string): Promise<Presentation | null> => {
    setPendingDeckId(deckId);
    setError(null);
    try {
      const [deck, connection] = await Promise.all([getDeck(deckId), createSession(deckId)]);
      return { deck, connection };
    } catch (err) {
      setError({ deckId, ...describeStartError(err) });
      return null;
    } finally {
      setPendingDeckId(null);
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { start, pendingDeckId, error, dismissError };
}
