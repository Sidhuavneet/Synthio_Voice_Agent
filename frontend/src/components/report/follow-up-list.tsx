import { CircleCheck, CircleDashed } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import type { AdverseEventCriteria, FollowUp, FollowUpKind } from "@/lib/types";

const KINDS: Record<FollowUpKind, { label: string; tone: ChipTone }> = {
  adverse_event: { label: "Adverse event report", tone: "danger" },
  medical_information: { label: "Medical information", tone: "accent" },
  follow_up: { label: "Follow-up", tone: "neutral" },
};

const CRITERIA: { key: keyof AdverseEventCriteria; label: string }[] = [
  { key: "identifiablePatient", label: "Identifiable patient" },
  { key: "identifiableReporter", label: "Identifiable reporter" },
  { key: "suspectProduct", label: "Suspect product" },
  { key: "adverseEvent", label: "Adverse event" },
];

/** Typed follow-up actions; adverse events show which minimum reporting criteria were heard. */
export function FollowUpList({ items }: { items: FollowUp[] }) {
  if (items.length === 0) return <p className="text-sm text-ink-muted">No open items.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((item, i) => (
        <li key={i} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <Chip tone={KINDS[item.kind].tone} className="px-2 py-0.5 text-[11px]">
            {KINDS[item.kind].label}
          </Chip>
          <p className="text-sm text-pretty text-ink-soft">{item.text}</p>
          {item.kind === "adverse_event" && <CriteriaChecklist criteria={item.aeCriteria} />}
        </li>
      ))}
    </ul>
  );
}

function CriteriaChecklist({ criteria }: { criteria: AdverseEventCriteria | null }) {
  if (!criteria) {
    return (
      <p className="text-xs text-ink-muted">
        Reporting criteria not assessed. Collect them before submitting.
      </p>
    );
  }
  const missing = CRITERIA.filter(({ key }) => !criteria[key]).length;
  return (
    <div className="space-y-1.5 rounded-xl bg-canvas p-3">
      <p className="text-xs font-medium text-ink-soft">
        {missing === 0
          ? "All four minimum reporting criteria were captured."
          : `${missing} of 4 minimum reporting criteria still to collect.`}
      </p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {CRITERIA.map(({ key, label }) => (
          <li
            key={key}
            className={cn(
              "flex items-center gap-1.5",
              criteria[key] ? "text-success" : "text-ink-muted",
            )}
          >
            {criteria[key] ? (
              <CircleCheck aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <CircleDashed aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="sr-only">{criteria[key] ? "Captured:" : "Missing:"}</span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
