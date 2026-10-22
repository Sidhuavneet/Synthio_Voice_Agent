import { Clock, FileText, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import type { SavedReport } from "@/lib/report-history";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export interface PastSessionRowProps {
  entry: SavedReport;
  onOpen: (entry: SavedReport) => void;
}

export function PastSessionRow({ entry, onOpen }: PastSessionRowProps) {
  const { report } = entry;
  const questions = report.questions.length;
  const flags = report.complianceFlags.length;
  const titleId = `past-report-${entry.id}`;

  return (
    <li
      aria-labelledby={titleId}
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <h4 id={titleId} className="truncate text-sm font-semibold text-ink">
          {entry.deckTitle}
        </h4>
        <p className="text-xs text-ink-muted">
          <time dateTime={new Date(entry.endedAt).toISOString()}>
            {dateFormatter.format(entry.endedAt)}
          </time>
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-soft [&_svg]:size-3.5 [&_svg]:text-ink-muted">
          <li className="inline-flex items-center gap-1 tabular-nums">
            <Clock aria-hidden />
            <span className="sr-only">Duration:</span>
            {formatDuration(report.durationSec)}
          </li>
          <li className="inline-flex items-center gap-1 tabular-nums">
            <MessageCircleQuestion aria-hidden />
            {questions} {questions === 1 ? "question" : "questions"}
          </li>
          <li className="inline-flex items-center gap-1 tabular-nums">
            <ShieldAlert aria-hidden />
            {flags} {flags === 1 ? "flag" : "flags"}
          </li>
        </ul>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start sm:self-center"
        aria-describedby={titleId}
        onClick={() => onOpen(entry)}
      >
        <FileText aria-hidden />
        Open report
      </Button>
    </li>
  );
}
