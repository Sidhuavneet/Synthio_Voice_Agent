"use client";

import { useCallback, useEffect, useState } from "react";
import { listDecks, ApiError } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import type { DeckSummary } from "@/lib/types";

export type DecksState =
  | { status: "loading" }
  | { status: "ready"; decks: DeckSummary[] }
  | { status: "error"; message: string; unreachable: boolean };

export function useDecks(): { state: DecksState; reload: () => void } {
  const [state, setState] = useState<DecksState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listDecks(controller.signal)
      .then((decks) => setState({ status: "ready", decks }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: toErrorMessage(error),
          unreachable: error instanceof ApiError && error.isUnreachable,
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}
