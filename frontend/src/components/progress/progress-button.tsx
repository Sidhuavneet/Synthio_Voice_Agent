"use client";

import { useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { ProgressPanel } from "@/components/progress/progress-panel";
import { Button } from "@/components/ui/button";
import type { SavedReport } from "@/lib/report-history";
import type { ResumeRequest } from "@/lib/types";

export interface ProgressButtonProps {
  pendingDeckId: string | null;
  /** `resume` is null for a fresh start (which discards saved progress). */
  onStart: (deckId: string, resume: ResumeRequest | null) => void;
  onOpenReport: (entry: SavedReport) => void;
}

/** Header button that opens the progress drawer. */
export function ProgressButton({ pendingDeckId, onStart, onOpenReport }: ProgressButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <ChartNoAxesColumn aria-hidden />
        Progress
      </Button>
      {open && (
        <ProgressPanel
          pendingDeckId={pendingDeckId}
          onClose={() => setOpen(false)}
          onStart={(deckId, resume) => {
            setOpen(false);
            onStart(deckId, resume);
          }}
          onOpenReport={(entry) => {
            setOpen(false);
            onOpenReport(entry);
          }}
        />
      )}
    </>
  );
}
