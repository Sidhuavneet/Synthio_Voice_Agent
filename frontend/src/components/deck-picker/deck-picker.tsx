"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DeckCard } from "@/components/deck-picker/deck-card";
import {
  DeckGridSkeleton,
  DecksError,
  EmptyDecks,
} from "@/components/deck-picker/deck-picker-states";
import { useDecks } from "@/hooks/use-decks";
import type { StartError } from "@/hooks/use-start-presentation";

export interface DeckPickerProps {
  pendingDeckId: string | null;
  startError: StartError | null;
  onStart: (deckId: string) => void;
  onDismissError: () => void;
}

export function DeckPicker({
  pendingDeckId,
  startError,
  onStart,
  onDismissError,
}: DeckPickerProps) {
  const { state, reload } = useDecks();
  const errorRef = useRef<HTMLDivElement>(null);

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
                disabled={pendingDeckId !== null}
                onStart={onStart}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
