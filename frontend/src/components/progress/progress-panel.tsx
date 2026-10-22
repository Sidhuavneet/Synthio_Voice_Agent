"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { FolderOpen, History, Layers, RefreshCw, Trash2, X } from "lucide-react";
import { DeckProgressRow } from "@/components/progress/deck-progress-row";
import { PastSessionRow } from "@/components/progress/past-session-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDecks } from "@/hooks/use-decks";
import { useReportHistory } from "@/hooks/use-report-history";
import { clearReports, type SavedReport } from "@/lib/report-history";
import type { ResumeRequest } from "@/lib/types";

export interface ProgressPanelProps {
  pendingDeckId: string | null;
  onStart: (deckId: string, resume: ResumeRequest | null) => void;
  onOpenReport: (entry: SavedReport) => void;
  onClose: () => void;
}

/**
 * Side drawer with per-deck progress and past session reports, all from this browser's
 * storage. A native modal dialog traps focus, closes on Esc and returns focus to its opener.
 */
export function ProgressPanel({
  pendingDeckId,
  onStart,
  onOpenReport,
  onClose,
}: ProgressPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Relative times are computed against the moment the panel opened.
  const [now] = useState(() => Date.now());
  const { state, reload } = useDecks();
  const reports = useReportHistory();
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Layout effect: its cleanup runs before the element is removed, so closing the dialog
  // still returns focus to the button that opened it.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  // The content wrapper fills the drawer, so a click on the dialog itself is on the backdrop.
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="progress-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleClick}
      className="my-0 mr-0 ml-auto h-dvh max-h-none w-full max-w-md bg-canvas p-0 text-ink shadow-stage backdrop:bg-ink/40 sm:rounded-l-2xl"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
          <h2 id="progress-title" className="text-lg font-semibold tracking-tight">
            Your progress
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close progress"
            autoFocus
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <PanelSection icon={<Layers aria-hidden />} title="Decks" id="progress-decks">
            {state.status === "loading" && (
              <div aria-busy aria-label="Loading decks" className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-line/60" />
                ))}
              </div>
            )}
            {state.status === "error" && (
              <div className="space-y-3">
                <p className="text-sm text-ink-muted">
                  Couldn&apos;t load the decks. {state.message}
                </p>
                <Button variant="secondary" size="sm" onClick={reload}>
                  <RefreshCw aria-hidden />
                  Try again
                </Button>
              </div>
            )}
            {state.status === "ready" && state.decks.length === 0 && (
              <EmptyState icon={<FolderOpen aria-hidden />}>
                No presentations available yet.
              </EmptyState>
            )}
            {state.status === "ready" && state.decks.length > 0 && (
              <ul className="divide-y divide-line">
                {state.decks.map((deck) => (
                  <DeckProgressRow
                    key={deck.id}
                    deck={deck}
                    now={now}
                    busy={pendingDeckId !== null}
                    onStart={onStart}
                  />
                ))}
              </ul>
            )}
          </PanelSection>

          <PanelSection
            icon={<History aria-hidden />}
            title="Past sessions"
            id="progress-reports"
            action={
              reports.length > 0 &&
              !confirmingClear && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(true)}>
                  <Trash2 aria-hidden />
                  Clear
                </Button>
              )
            }
          >
            {confirmingClear && (
              <div
                role="group"
                aria-label="Clear past sessions"
                className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2"
              >
                <p className="mr-auto text-xs font-medium text-danger">
                  Delete all saved reports from this browser?
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  autoFocus
                  onClick={() => {
                    clearReports();
                    setConfirmingClear(false);
                  }}
                >
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(false)}>
                  Cancel
                </Button>
              </div>
            )}
            {reports.length === 0 ? (
              <EmptyState icon={<History aria-hidden />}>
                Finished sessions and their reports will appear here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {reports.map((entry) => (
                  <PastSessionRow key={entry.id} entry={entry} onOpen={onOpenReport} />
                ))}
              </ul>
            )}
          </PanelSection>

          <p className="text-xs text-pretty text-ink-muted">
            Progress and reports are saved only in this browser.
          </p>
        </div>
      </div>
    </dialog>
  );
}

function PanelSection({
  icon,
  title,
  id,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  id: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <section aria-labelledby={id} className="space-y-4">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <h3
            id={id}
            className="flex items-center gap-2 text-sm font-semibold text-ink [&_svg]:size-4 [&_svg]:text-accent"
          >
            {icon}
            {title}
          </h3>
          {action}
        </div>
        {children}
      </section>
    </Card>
  );
}

function EmptyState({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted [&_svg]:size-5 [&_svg]:text-ink-muted">
      {icon}
      <p className="text-pretty">{children}</p>
    </div>
  );
}
