"use client";

import { useState } from "react";
import { DeckPicker } from "@/components/deck-picker/deck-picker";
import { SessionView } from "@/components/session/session-view";
import { BrandMark } from "@/components/ui/brand-mark";
import { useStartPresentation, type Presentation } from "@/hooks/use-start-presentation";
import { clearProgress } from "@/lib/progress";
import type { ResumeRequest } from "@/lib/types";

export function PresentationApp() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const { start, pendingDeckId, error, dismissError } = useStartPresentation();

  const handleStart = async (deckId: string, resume: ResumeRequest | null) => {
    const result = await start(deckId, resume ?? undefined);
    if (!result) return;
    // Starting over discards saved progress, but only once the new session is ready.
    if (!resume) clearProgress(deckId);
    setPresentation(result);
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
          onStart={(deckId, resume) => void handleStart(deckId, resume)}
          onDismissError={dismissError}
        />
      </main>
    </>
  );
}
