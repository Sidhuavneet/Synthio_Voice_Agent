import { ShieldCheck } from "lucide-react";
import { ComplianceFlagItem } from "@/components/compliance/compliance-flag-item";
import type { ComplianceFlag } from "@/lib/types";

/** Questions the presenter flagged and deflected during this session, newest first. */
export function CompliancePanel({ flags }: { flags: ComplianceFlag[] }) {
  if (flags.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <ShieldCheck aria-hidden className="size-4 text-success" />
        No questions flagged
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {flags.toReversed().map((flag) => (
        <li key={flag.id} className="animate-slide-in">
          <ComplianceFlagItem flag={flag} />
        </li>
      ))}
    </ol>
  );
}
