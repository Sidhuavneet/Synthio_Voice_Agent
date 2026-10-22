import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTO_REPORT_DELAY_MS } from "@/lib/auto-report";

export interface AutoReportNoticeProps {
  secondsLeft: number;
  onOpenNow: () => void;
  onStay: () => void;
}

/** Countdown shown once the presentation is over, before the report opens by itself. */
export function AutoReportNotice({ secondsLeft, onOpenNow, onStay }: AutoReportNoticeProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-strong sm:flex-row sm:items-center sm:justify-between">
      {/* Announced once; the ticking number is hidden so screen readers aren't read every second. */}
      <p role="status" className="sr-only">
        Presentation complete. Your report opens in {AUTO_REPORT_DELAY_MS / 1000} seconds. Ask a
        question to stay.
      </p>
      <p aria-hidden className="text-pretty">
        <span className="font-semibold">Presentation complete</span>
        <span className="text-ink-soft">
          {" "}
          — opening your report in <span className="tabular-nums">{secondsLeft}s</span> · Ask a
          question to stay
        </span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" onClick={onOpenNow}>
          <FileText aria-hidden />
          View report now
        </Button>
        <Button variant="secondary" size="sm" onClick={onStay}>
          Stay
        </Button>
      </div>
    </div>
  );
}
