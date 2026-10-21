"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { ComplianceCategoryChip } from "@/components/compliance/compliance-flag-item";
import type { ComplianceFlag } from "@/lib/types";

const TOAST_VISIBLE_MS = 6_000;

/** Briefly announces the newest compliance flag. */
export function ComplianceToast({ flag }: { flag: ComplianceFlag | undefined }) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    if (!flag) return;
    const timer = window.setTimeout(() => setDismissedId(flag.id), TOAST_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [flag]);

  const visible = flag !== undefined && flag.id !== dismissedId;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-end sm:inset-x-6"
    >
      {visible && (
        <div
          key={flag.id}
          className="pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-stage"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
            <ShieldAlert aria-hidden className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink">Compliance flag</p>
              <ComplianceCategoryChip category={flag.category} />
            </div>
            <p className="line-clamp-2 text-sm text-ink-muted">&ldquo;{flag.question}&rdquo;</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissedId(flag.id)}
            className="-m-1 rounded-full p-1 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
