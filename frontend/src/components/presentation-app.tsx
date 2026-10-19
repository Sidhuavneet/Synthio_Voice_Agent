"use client";

import { useState } from "react";
import { DeckPicker } from "@/components/deck-picker/deck-picker";
import { SessionView } from "@/components/session/session-view";
import { BrandMark } from "@/components/ui/brand-mark";
import { useStartPresentation, type Presentation } from "@/hooks/use-start-presentation";

export function PresentationApp() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const { start, pendingDeckId, error, dismissError } = useStartPresentation();

  const handleStart = async (deckId: string) => {
    const result = await start(deckId);
    if (result) setPresentation(result);
  };

  if (presentation) {
    return (
      <SessionView
        key={presentation.connection.roomName}
        presentation={presentation}
        onExit={() => setPresentation(null)}
      />
    );
  }

  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8">
        <BrandMark />
      </header>
      <main className="flex-1">
        <DeckPicker
          pendingDeckId={pendingDeckId}
          startError={error}
          onStart={(deckId) => void handleStart(deckId)}
          onDismissError={dismissError}
        />
      </main>
    </>
  );
}
