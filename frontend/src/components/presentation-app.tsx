"use client";

import { useState } from "react";
import { DeckPicker } from "@/components/deck-picker/deck-picker";
import { PastReportScreen } from "@/components/progress/past-report-screen";
import { ProgressButton } from "@/components/progress/progress-button";
import { SessionView } from "@/components/session/session-view";
import { BrandMark } from "@/components/ui/brand-mark";
import { useStartPresentation, type Presentation } from "@/hooks/use-start-presentation";
import { clearProgress } from "@/lib/progress";
import type { SavedReport } from "@/lib/report-history";
import type { ResumeRequest } from "@/lib/types";

export function PresentationApp() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [pastReport, setPastReport] = useState<SavedReport | null>(null);
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

  if (pastReport) {
    return (
      <PastReportScreen
        key={pastReport.id}
        entry={pastReport}
        onBack={() => setPastReport(null)}
      />
    );
  }

  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-6 sm:px-8">
        <BrandMark />
        <ProgressButton
          pendingDeckId={pendingDeckId}
          onStart={(deckId, resume) => void handleStart(deckId, resume)}
          onOpenReport={setPastReport}
        />
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
