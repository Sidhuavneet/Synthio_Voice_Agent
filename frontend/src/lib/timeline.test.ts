import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import {
  buildSessionTimeline,
  interruptedPoint,
  questionJumpTo,
  type NarrationMark,
} from "@/lib/timeline";
import type { SlideTrigger } from "@/lib/types";

const change = (toIndex: number, trigger: SlideTrigger): TimelineEntry => ({
  type: "slide_changed",
  fromIndex: 0,
  toIndex,
  trigger,
  reason: trigger === "question" ? "dosing" : null,
  question: null,
  timestamp: 0,
});

const bargeIn = (slideIndex: number, pointIndex: number | null): TimelineEntry => ({
  type: "interruption",
  kind: "barge_in",
  slideIndex,
  pointIndex,
  detectionMs: 250,
  timestamp: 0,
});

/** Narration seen starting on `slideIndex` once `afterEntries` timeline entries had arrived. */
const narrated = (slideIndex: number, afterEntries: number): NarrationMark => ({
  slideIndex,
  afterEntries,
});

describe("questionJumpTo", () => {
  it("returns the jump that put the slide on screen", () => {
    const timeline = [change(1, "auto"), change(4, "question")];
    expect(questionJumpTo(timeline, 4, null)).toMatchObject({ toIndex: 4, reason: "dosing" });
  });

  it("ignores older jumps and other triggers", () => {
    expect(questionJumpTo([change(4, "question"), change(1, "resume")], 1, null)).toBeNull();
    expect(questionJumpTo([change(4, "question"), change(1, "resume")], 4, null)).toBeNull();
    expect(questionJumpTo([], 0, null)).toBeNull();
  });

  it("is forgotten once the presenter starts narrating the slide", () => {
    const timeline = [change(1, "auto"), change(4, "question")];
    expect(questionJumpTo(timeline, 4, narrated(4, 2))).toBeNull();
  });

  it("is kept for narration seen before the jump or on another slide", () => {
    const timeline = [change(1, "auto"), change(4, "question")];
    expect(questionJumpTo(timeline, 4, narrated(4, 1))).not.toBeNull();
    expect(questionJumpTo(timeline, 4, narrated(1, 2))).not.toBeNull();
  });
});

describe("interruptedPoint", () => {
  it("returns the point cut into on the current slide", () => {
    expect(interruptedPoint([change(2, "auto"), bargeIn(2, 1)], 2, null)).toBe(1);
  });

  it("forgets interruptions from before the slide came on screen", () => {
    expect(
      interruptedPoint([bargeIn(2, 1), change(4, "question"), change(2, "resume")], 2, null),
    ).toBeNull();
  });

  it("uses the latest barge-in, which may not be during a point", () => {
    const timeline = [change(2, "auto"), bargeIn(2, 1), bargeIn(2, null)];
    expect(interruptedPoint(timeline, 2, null)).toBeNull();
  });

  it("forgets the barge-in once narration resumes on the same slide", () => {
    const timeline = [change(2, "auto"), bargeIn(2, 1)];
    expect(interruptedPoint(timeline, 2, narrated(2, 2))).toBeNull();
  });

  it("keeps the barge-in for narration seen before it", () => {
    const timeline = [change(2, "auto"), bargeIn(2, 1)];
    expect(interruptedPoint(timeline, 2, narrated(2, 1))).toBe(1);
  });

  it("returns a later barge-in after narration resumed", () => {
    const timeline = [change(2, "auto"), bargeIn(2, 0), bargeIn(2, 2)];
    expect(interruptedPoint(timeline, 2, narrated(2, 2))).toBe(2);
  });
});

describe("buildSessionTimeline", () => {
  const span = { startedAt: 1000, endedAt: 2000, startSlide: 0 };
  const at = (entry: TimelineEntry, timestamp: number): TimelineEntry => ({ ...entry, timestamp });
  const label = (index: number) => `slide ${index + 1}`;

  it("splits the session into slide segments", () => {
    const { segments } = buildSessionTimeline(
      span,
      [at(change(1, "auto"), 1250), at(change(3, "question"), 1500)],
      [],
      label,
    );
    expect(segments).toEqual([
      { slideIndex: 0, start: 0, end: 0.25 },
      { slideIndex: 1, start: 0.25, end: 0.5 },
      { slideIndex: 3, start: 0.5, end: 1 },
    ]);
  });

  it("places jumps, barge-ins and flags in time order, clamped to the session", () => {
    const flag = {
      id: "f",
      category: "adverse_event" as const,
      question: "I felt dizzy",
      slideIndex: 3,
      timestamp: 5000,
    };
    const { moments } = buildSessionTimeline(
      span,
      [at(change(3, "question"), 1500), at(bargeIn(3, 0), 900)],
      [flag],
      label,
    );
    expect(moments.map((m) => [m.kind, m.at])).toEqual([
      ["barge_in", 0],
      ["question", 0.5],
      ["flag", 1],
    ]);
    expect(moments[2].label).toContain("I felt dizzy");
  });
});
