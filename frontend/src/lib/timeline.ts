import type { TimelineEntry } from "@/hooks/use-agent-events";
import type { ComplianceFlag, SlideChange } from "@/lib/types";

/** Browser-clock bounds of a session, captured when it ends. */
export interface SessionSpan {
  startedAt: number;
  endedAt: number;
  /** Slide on screen when the presenter first synced. */
  startSlide: number;
}

/** A stretch of the session on one slide; `start`/`end` are fractions of the session. */
export interface SlideSegment {
  slideIndex: number;
  start: number;
  end: number;
}

export type MomentKind = "question" | "barge_in" | "flag";

/** A point-in-time event on the report timeline; `at` is a fraction of the session. */
export interface Moment {
  kind: MomentKind;
  at: number;
  slideIndex: number;
  /** Plain-text description, also used as the tooltip. */
  label: string;
}

/**
 * Where narration of a point last started: the slide, and how many timeline entries had
 * arrived by then. Narration resuming on the same slide emits no event, so this is how the
 * session view tells that a barge-in or a question jump has been moved past.
 */
export interface NarrationMark {
  slideIndex: number;
  /** `timeline.length` when the narration was seen starting. */
  afterEntries: number;
}

/** True when narration started on `slideIndex` after the timeline entry at `position`. */
function narratedSince(
  narration: NarrationMark | null,
  slideIndex: number,
  position: number,
): boolean {
  return narration?.slideIndex === slideIndex && narration.afterEntries > position;
}

function lastSlideChange(timeline: TimelineEntry[]): number {
  return timeline.findLastIndex((entry) => entry.type === "slide_changed");
}

/**
 * The question jump that put `slideIndex` on screen, if that is how it got there and the
 * presenter has not started narrating the slide since.
 */
export function questionJumpTo(
  timeline: TimelineEntry[],
  slideIndex: number,
  narration: NarrationMark | null,
): SlideChange | null {
  const position = lastSlideChange(timeline);
  const entry = timeline[position];
  return entry?.type === "slide_changed" &&
    entry.trigger === "question" &&
    entry.toIndex === slideIndex &&
    !narratedSince(narration, slideIndex, position)
    ? entry
    : null;
}

/**
 * The point the user cut into on `slideIndex` since it came on screen, or null once narration
 * has started again after the cut. Callers show it only while narration is paused.
 */
export function interruptedPoint(
  timeline: TimelineEntry[],
  slideIndex: number,
  narration: NarrationMark | null,
): number | null {
  for (let i = timeline.length - 1; i > lastSlideChange(timeline); i--) {
    const entry = timeline[i];
    if (entry.type === "interruption" && entry.kind === "barge_in") {
      return entry.slideIndex === slideIndex && !narratedSince(narration, slideIndex, i)
        ? entry.pointIndex
        : null;
    }
  }
  return null;
}

/**
 * Slide segments and moments for the report timeline. Event times come from the agent's clock
 * and the span from the browser's, so positions are clamped to the session.
 */
export function buildSessionTimeline(
  span: SessionSpan,
  timeline: TimelineEntry[],
  flags: ComplianceFlag[],
  slideLabel: (index: number) => string,
): { segments: SlideSegment[]; moments: Moment[] } {
  const length = Math.max(1, span.endedAt - span.startedAt);
  const at = (timestamp: number) => Math.min(1, Math.max(0, (timestamp - span.startedAt) / length));

  const segments: SlideSegment[] = [];
  let current = { slideIndex: span.startSlide, start: 0 };
  for (const entry of timeline) {
    if (entry.type !== "slide_changed") continue;
    const end = at(entry.timestamp);
    if (end > current.start) segments.push({ ...current, end });
    current = { slideIndex: entry.toIndex, start: end };
  }
  if (current.start < 1) segments.push({ ...current, end: 1 });

  const moments: Moment[] = [];
  for (const entry of timeline) {
    if (entry.type === "slide_changed" && entry.trigger === "question") {
      const question = entry.question ? ` after “${entry.question}”` : "";
      moments.push({
        kind: "question",
        at: at(entry.timestamp),
        slideIndex: entry.toIndex,
        label: `Jumped to ${slideLabel(entry.toIndex)}${question}`,
      });
    } else if (entry.type === "interruption" && entry.kind === "barge_in") {
      moments.push({
        kind: "barge_in",
        at: at(entry.timestamp),
        slideIndex: entry.slideIndex,
        label: `You cut in on ${slideLabel(entry.slideIndex)}`,
      });
    }
  }
  for (const flag of flags) {
    moments.push({
      kind: "flag",
      at: at(flag.timestamp),
      slideIndex: flag.slideIndex,
      label: `Compliance flag on ${slideLabel(flag.slideIndex)}: “${flag.question}”`,
    });
  }
  moments.sort((a, b) => a.at - b.at);
  return { segments, moments };
}
