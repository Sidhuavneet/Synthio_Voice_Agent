"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DeckCard } from "@/components/deck-picker/deck-card";
import {
  DeckGridSkeleton,
  DecksError,
  EmptyDecks,
  WakingNotice,
} from "@/components/deck-picker/deck-picker-states";
import { ResumeDialog } from "@/components/deck-picker/resume-dialog";
import { useDecks } from "@/hooks/use-decks";
import { useElapsedFlag } from "@/hooks/use-elapsed-flag";
import type { StartError } from "@/hooks/use-start-presentation";
import { resumeSlideIndex, toResumeRequest, type DeckProgress } from "@/lib/progress";
import type { DeckSummary, ResumeRequest } from "@/lib/types";

// Longer than a warm request; a cold free-tier API takes 30–50 s.
const SLOW_REQUEST_MS = 4_000;

export interface DeckPickerProps {
  pendingDeckId: string | null;
  startError: StartError | null;
  /** `resume` is null for a fresh start (which discards saved progress). */
  onStart: (deckId: string, resume: ResumeRequest | null) => void;
  onDismissError: () => void;
}

interface ResumeChoice {
  deck: DeckSummary;
  progress: DeckProgress;
}

export function DeckPicker({
  pendingDeckId,
  startError,
  onStart,
  onDismissError,
}: DeckPickerProps) {
  const { state, reload } = useDecks();
  const errorRef = useRef<HTMLDivElement>(null);
  const [resumeChoice, setResumeChoice] = useState<ResumeChoice | null>(null);
  const slowLoad = useElapsedFlag(state.status === "loading", SLOW_REQUEST_MS);
  const slowStart = useElapsedFlag(pendingDeckId !== null, SLOW_REQUEST_MS);

  const handleStart = (deck: DeckSummary, progress: DeckProgress | null) => {
    if (progress) setResumeChoice({ deck, progress });
    else onStart(deck.id, null);
  };

  const choose = (resume: boolean) => {
    if (!resumeChoice) return;
    const { deck, progress } = resumeChoice;
    setResumeChoice(null);
    onStart(deck.id, resume ? toResumeRequest(progress, deck.slideCount) : null);
  };

  // The failing card can be far below the alert on small screens.
  useEffect(() => {
    if (startError)
      errorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [startError]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
      <header className="max-w-2xl space-y-4">
        <p className="text-sm font-medium tracking-wide text-accent">Voice AI presentations</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          Pick a briefing. Your presenter takes it from there.
        </h1>
        <p className="text-lg text-pretty text-ink-muted">
          An AI expert walks you through each slide out loud. Interrupt with a question anytime and
          it will jump to the slide that answers it.
        </p>
      </header>

      <section aria-label="Presentations" className="mt-10 space-y-5 sm:mt-14">
        {startError && (
          <div ref={errorRef} className="scroll-mt-4">
            <Alert
              title={startError.title}
              action={
                <Button variant="secondary" size="sm" onClick={onDismissError}>
                  Dismiss
                </Button>
              }
            >
              {startError.message}
            </Alert>
          </div>
        )}

        {slowLoad && <WakingNotice />}
        {state.status === "loading" && <DeckGridSkeleton />}
        {state.status === "error" && (
          <DecksError message={state.message} unreachable={state.unreachable} onRetry={reload} />
        )}
        {state.status === "ready" && state.decks.length === 0 && <EmptyDecks />}
        {state.status === "ready" && state.decks.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {state.decks.map((deck, i) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                featured={i === 0}
                pending={pendingDeckId === deck.id}
                slow={slowStart}
                disabled={pendingDeckId !== null}
                onStart={handleStart}
              />
            ))}
          </div>
        )}
      </section>

      {resumeChoice && (
        <ResumeDialog
          deck={resumeChoice.deck}
          progress={resumeChoice.progress}
          resumeIndex={resumeSlideIndex(resumeChoice.progress, resumeChoice.deck.slideCount)}
          onResume={() => choose(true)}
          onStartOver={() => choose(false)}
          onCancel={() => setResumeChoice(null)}
        />
      )}
    </div>
  );
}
