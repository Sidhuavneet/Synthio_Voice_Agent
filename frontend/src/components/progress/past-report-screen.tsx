"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { SessionReportView } from "@/components/report/session-report-view";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { getDeck } from "@/lib/api";
import { toErrorMessage } from "@/lib/errors";
import type { SavedReport } from "@/lib/report-history";
import { parseTranscriptRow } from "@/lib/transcript";
import type { Deck } from "@/lib/types";

export interface PastReportScreenProps {
  entry: SavedReport;
  onBack: () => void;
}

type DeckState =
  { status: "loading" } | { status: "ready"; deck: Deck } | { status: "error"; message: string };

/**
 * A saved report shown read-only in the regular report view. The deck (slide titles,
 * presenter) is fetched again; the live timeline isn't stored, so it is omitted.
 */
export function PastReportScreen({ entry, onBack }: PastReportScreenProps) {
  const [state, setState] = useState<DeckState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const transcript = useMemo(
    () => entry.transcript.map(parseTranscriptRow).filter((row) => row !== null),
    [entry.transcript],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getDeck(entry.deckId, controller.signal)
      .then((deck) => setState({ status: "ready", deck }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: toErrorMessage(error) });
      });
    return () => controller.abort();
  }, [entry.deckId, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.status === "ready") {
    return (
      <SessionReportView
        deck={state.deck}
        state={{ status: "ready", report: entry.report }}
        timeline={[]}
        span={null}
        transcript={transcript}
        onExit={onBack}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <BrandMark />
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Back to decks
        </Button>
      </header>
      <main className="mt-8 space-y-4 sm:mt-12">
        <p className="text-sm font-medium tracking-wide text-accent">Session report</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
          {entry.deckTitle}
        </h1>
        {state.status === "loading" ? (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading report…
          </p>
        ) : (
          <Alert
            title="Couldn't load this deck"
            action={
              <Button variant="secondary" size="sm" onClick={retry}>
                <RefreshCw aria-hidden />
                Try again
              </Button>
            }
          >
            {state.message}
          </Alert>
        )}
      </main>
    </div>
  );
}
