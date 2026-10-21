import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ComplianceFlagItem } from "@/components/compliance/compliance-flag-item";
import type { ComplianceFlag } from "@/lib/types";

/** Questions the presenter flagged and deflected during this session, newest first. */
export function CompliancePanel({ flags }: { flags: ComplianceFlag[] }) {
  return (
    <section aria-labelledby="compliance-heading" className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="compliance-heading"
          className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          <ShieldAlert aria-hidden className="size-3.5" />
          Compliance
        </h2>
        {flags.length > 0 && (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning tabular-nums">
            {flags.length} flagged
          </span>
        )}
      </div>

      {flags.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          <ShieldCheck aria-hidden className="size-4 text-success" />
          No questions flagged
        </p>
      ) : (
        <ol className="max-h-36 min-h-0 space-y-3 overflow-y-auto pr-1">
          {flags.toReversed().map((flag) => (
            <li key={flag.id} className="animate-slide-in">
              <ComplianceFlagItem flag={flag} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
