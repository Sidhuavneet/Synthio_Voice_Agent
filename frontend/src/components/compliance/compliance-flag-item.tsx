import type { ReactNode } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { COMPLIANCE_CATEGORY_LABELS, formatTimeOfDay } from "@/lib/format";
import type { ComplianceCategory, ComplianceFlag } from "@/lib/types";

const CATEGORY_TONES: Record<ComplianceCategory, ChipTone> = {
  adverse_event: "danger",
  off_label: "warning",
  personal_medical_advice: "warning",
  out_of_scope: "neutral",
};

export function ComplianceCategoryChip({ category }: { category: ComplianceCategory }) {
  return (
    <Chip tone={CATEGORY_TONES[category]} className="px-2 py-0.5 text-[11px]">
      {COMPLIANCE_CATEGORY_LABELS[category]}
    </Chip>
  );
}

export interface ComplianceFlagItemProps {
  flag: ComplianceFlag;
  /** Rendered in place of the plain "Slide n" label, e.g. a link. */
  slideLabel?: ReactNode;
  className?: string;
}

/** One flagged question: category chip, slide, time and the question itself. */
export function ComplianceFlagItem({ flag, slideLabel, className }: ComplianceFlagItemProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        <ComplianceCategoryChip category={flag.category} />
        <span>{slideLabel ?? `Slide ${flag.slideIndex + 1}`}</span>
        <span aria-hidden>·</span>
        <time dateTime={new Date(flag.timestamp).toISOString()} className="tabular-nums">
          {formatTimeOfDay(flag.timestamp)}
        </time>
      </div>
      <p className="text-sm text-pretty text-ink-soft">&ldquo;{flag.question}&rdquo;</p>
    </div>
  );
}
