"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDeck } from "@/lib/api";
import type { DeckProgress } from "@/lib/progress";
import type { DeckSummary } from "@/lib/types";

export interface ResumeDialogProps {
  deck: DeckSummary;
  progress: DeckProgress;
  /** Slide the session would continue from. */
  resumeIndex: number;
  onResume: () => void;
  onStartOver: () => void;
  onCancel: () => void;
}

/** Fetches a slide title for the prompt; the dialog works without it. */
function useSlideTitle(deckId: string, index: number): string | null {
  const [title, setTitle] = useState<{ key: string; value: string } | null>(null);
  const key = `${deckId}:${index}`;

  useEffect(() => {
    const controller = new AbortController();
    getDeck(deckId, controller.signal)
      .then((deck) => {
        const slide = deck.slides[index];
        if (slide) setTitle({ key, value: slide.title });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [deckId, index, key]);

  return title?.key === key ? title.value : null;
}

/**
 * Asks whether to continue a deck from saved progress (contract §5). A native modal dialog
 * traps focus and closes on Esc.
 */
export function ResumeDialog({
  deck,
  progress,
  resumeIndex,
  onResume,
  onStartOver,
  onCancel,
}: ResumeDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const slideTitle = useSlideTitle(deck.id, resumeIndex);
  const presentedCount = progress.presented.length;

  // Layout effect: its cleanup runs before the element is removed, so closing the dialog
  // still returns focus to the button that opened it.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  // A click on the dialog element itself (not its content) is a click on the backdrop.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onCancel();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="resume-title"
      aria-describedby="resume-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={handleClick}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-stage backdrop:bg-ink/40"
    >
      <div className="space-y-5 p-6">
        <div className="space-y-2">
          <h2 id="resume-title" className="text-lg font-semibold tracking-tight">
            Pick up where you left off?
          </h2>
          <p id="resume-description" className="text-sm text-pretty text-ink-muted">
            You&apos;ve already covered {presentedCount} of {deck.slideCount} slides of{" "}
            <span className="font-medium text-ink-soft">{deck.title}</span>.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button autoFocus onClick={onResume} className="h-auto min-h-11 justify-start py-2.5">
            <History aria-hidden />
            <span className="min-w-0 truncate text-left">
              Resume from slide {resumeIndex + 1}
              {slideTitle && `: ${slideTitle}`}
            </span>
          </Button>
          <Button variant="secondary" onClick={onStartOver} className="justify-start">
            <RotateCcw aria-hidden />
            Start over
          </Button>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}
