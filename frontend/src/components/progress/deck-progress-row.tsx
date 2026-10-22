"use client";

import { useRef, useState } from "react";
import { History, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useDeckProgressSummary } from "@/hooks/use-deck-progress";
import { cn } from "@/lib/cn";
import {
  clearProgress,
  formatRelativeTime,
  toResumeRequest,
  type DeckStatus,
} from "@/lib/progress";
import type { DeckSummary, ResumeRequest } from "@/lib/types";

const STATUS_LABELS: Record<DeckStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

export interface DeckProgressRowProps {
  deck: DeckSummary;
  now: number;
  /** A presentation is starting; actions are disabled meanwhile. */
  busy: boolean;
  /** `resume` is null for a fresh start (which discards saved progress). */
  onStart: (deckId: string, resume: ResumeRequest | null) => void;
}

export function DeckProgressRow({ deck, now, busy, onStart }: DeckProgressRowProps) {
  const summary = useDeckProgressSummary(deck.id, deck.slideCount);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetRef = useRef<HTMLButtonElement>(null);
  const { status, presentedCount, slideCount, resumeIndex, progress } = summary;
  const percent = slideCount > 0 ? Math.round((presentedCount / slideCount) * 100) : 0;
  const titleId = `deck-progress-${deck.id}`;

  const cancelReset = () => {
    setConfirmingReset(false);
    // The confirm buttons unmount; put focus back where the user started.
    requestAnimationFrame(() => resetRef.current?.focus());
  };

  const confirmReset = () => {
    clearProgress(deck.id);
    setConfirmingReset(false);
  };

  const activity =
    status === "completed" && summary.completedAt !== null
      ? `Completed ${formatRelativeTime(summary.completedAt, now)}`
      : summary.updatedAt !== null
        ? `Last active ${formatRelativeTime(summary.updatedAt, now)}`
        : "No activity yet";

  return (
    <li aria-labelledby={titleId} className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <h4 id={titleId} className="min-w-0 text-sm font-semibold text-pretty text-ink">
          {deck.title}
        </h4>
        <Chip
          tone={status === "in_progress" ? "accent" : "neutral"}
          className={cn(
            "shrink-0",
            status === "completed" && "bg-success/10 text-success ring-success/20",
          )}
        >
          {STATUS_LABELS[status]}
        </Chip>
      </div>

      <div className="space-y-1.5">
        <div
          role="progressbar"
          aria-label={`${deck.title}: slides presented`}
          aria-valuemin={0}
          aria-valuemax={slideCount}
          aria-valuenow={presentedCount}
          aria-valuetext={`${presentedCount} of ${slideCount} slides presented`}
          className="h-1.5 overflow-hidden rounded-full bg-line"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              status === "completed" ? "bg-success" : "bg-accent",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
          <span className="tabular-nums">
            {presentedCount}/{slideCount} slides presented
          </span>
          {resumeIndex !== null && (
            <span className="tabular-nums">Current slide {resumeIndex + 1}</span>
          )}
          <span>{activity}</span>
        </p>
      </div>

      {confirmingReset ? (
        <div
          role="group"
          aria-label={`Reset progress for ${deck.title}`}
          className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2"
        >
          <p className="mr-auto text-xs font-medium text-danger">
            Reset this deck&apos;s progress?
          </p>
          <Button variant="danger" size="sm" autoFocus onClick={confirmReset}>
            Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelReset}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "in_progress" && progress && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onStart(deck.id, toResumeRequest(progress, slideCount))}
            >
              <History aria-hidden />
              Resume
            </Button>
          )}
          {status !== "in_progress" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => onStart(deck.id, null)}
            >
              <Play aria-hidden />
              {status === "completed" ? "Start over" : "Start"}
            </Button>
          )}
          {status !== "not_started" && (
            <Button
              ref={resetRef}
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw aria-hidden />
              Reset
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
