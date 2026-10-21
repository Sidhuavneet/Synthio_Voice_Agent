import { CornerDownRight, Hand, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { Moment, MomentKind, SlideSegment } from "@/lib/timeline";

const MOMENT_STYLES: Record<MomentKind, { icon: typeof Hand; className: string; name: string }> = {
  question: { icon: CornerDownRight, className: "bg-accent text-white", name: "Question jumps" },
  barge_in: { icon: Hand, className: "bg-ink text-white", name: "You cut in" },
  flag: { icon: ShieldAlert, className: "bg-warning text-white", name: "Compliance flags" },
};

// Alternating tints keep neighbouring segments apart without implying an order.
const SEGMENT_TINTS = ["bg-accent-light/70", "bg-accent-soft"];

export interface SessionTimelineProps {
  segments: SlideSegment[];
  moments: Moment[];
  durationSec: number;
  slideTitle: (index: number) => string;
}

/** The whole session on one strip: which slide was up when, and where things happened. */
export function SessionTimeline({ segments, moments, durationSec, slideTitle }: SessionTimelineProps) {
  const kinds = new Set(moments.map((moment) => moment.kind));
  return (
    <div className="space-y-3">
      <div className="relative pt-7">
        <ol aria-label="Moments" className="absolute inset-x-0 top-0 h-6">
          {moments.map((moment, i) => {
            const { icon: Icon, className } = MOMENT_STYLES[moment.kind];
            return (
              <li
                key={i}
                title={moment.label}
                className={cn(
                  "absolute flex size-6 -translate-x-1/2 items-center justify-center rounded-full shadow-card ring-2 ring-surface",
                  className,
                )}
                style={{ left: `clamp(12px, ${moment.at * 100}%, calc(100% - 12px))` }}
              >
                <Icon aria-hidden className="size-3" />
                <span className="sr-only">{moment.label}</span>
              </li>
            );
          })}
        </ol>
        <ol aria-label="Slides over time" className="flex h-9 gap-0.5 overflow-hidden rounded-lg">
          {segments.map((segment, i) => (
            <li
              key={i}
              title={`Slide ${segment.slideIndex + 1}: ${slideTitle(segment.slideIndex)}`}
              className={cn(
                "flex min-w-0 items-center justify-center text-xs font-medium text-accent-strong tabular-nums",
                SEGMENT_TINTS[segment.slideIndex % SEGMENT_TINTS.length],
              )}
              style={{ flexGrow: segment.end - segment.start, flexBasis: 0 }}
            >
              <span className="truncate px-1">{segment.slideIndex + 1}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-ink-muted">
        <span className="tabular-nums">0:00 – {formatDuration(durationSec)}</span>
        <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(MOMENT_STYLES) as MomentKind[])
            .filter((kind) => kinds.has(kind))
            .map((kind) => {
              const { icon: Icon, className, name } = MOMENT_STYLES[kind];
              return (
                <li key={kind} className="flex items-center gap-1.5">
                  <span
                    className={cn("flex size-4 items-center justify-center rounded-full", className)}
                  >
                    <Icon className="size-2.5" />
                  </span>
                  {name}
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
