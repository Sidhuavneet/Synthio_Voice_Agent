import { describe, expect, it } from "vitest";
import { narrationProgress, recordPoint, segmentFill } from "@/lib/slide-progress";

describe("recordPoint", () => {
  it("keeps the furthest point per slide", () => {
    let furthest = recordPoint({}, 2, 0);
    furthest = recordPoint(furthest, 2, 1);
    expect(furthest).toEqual({ 2: 1 });
    furthest = recordPoint(furthest, 3, 0);
    expect(furthest).toEqual({ 2: 1, 3: 0 });
  });

  it("returns the same object when nothing moved forward", () => {
    const furthest = { 1: 2 };
    expect(recordPoint(furthest, 1, 1)).toBe(furthest);
    expect(recordPoint(furthest, 1, 2)).toBe(furthest);
    expect(recordPoint(furthest, 1, null)).toBe(furthest);
    expect(recordPoint(furthest, 4, -1)).toBe(furthest);
  });
});

describe("narrationProgress", () => {
  it("counts the intro and each played point as equal parts", () => {
    // Three points: intro + 3 points = 4 parts.
    expect(narrationProgress(undefined, 3)).toBe(0);
    expect(narrationProgress(0, 3)).toBe(0.25);
    expect(narrationProgress(1, 3)).toBe(0.5);
    expect(narrationProgress(2, 3)).toBe(0.75);
  });

  it("is never full before the slide is presented, and clamps bad input", () => {
    expect(narrationProgress(9, 3)).toBe(0.75);
    expect(narrationProgress(-1, 3)).toBe(0);
    expect(narrationProgress(0, 0)).toBe(0);
  });
});

describe("segmentFill", () => {
  const base = { currentIndex: 2, presented: new Set([0, 1]), furthest: { 2: 1 }, pointCount: 3 };

  it("fills presented slides", () => {
    expect(segmentFill({ ...base, index: 0 })).toBe(1);
    expect(segmentFill({ ...base, index: 1 })).toBe(1);
  });

  it("fills the current slide by narration", () => {
    expect(segmentFill({ ...base, index: 2 })).toBe(0.5);
    expect(segmentFill({ ...base, index: 2, furthest: {} })).toBe(0);
  });

  it("leaves future slides empty, even with progress recorded earlier", () => {
    expect(segmentFill({ ...base, index: 3 })).toBe(0);
    expect(segmentFill({ ...base, index: 3, furthest: { 3: 2 } })).toBe(0);
  });

  it("keeps the current slide full once it has been presented", () => {
    expect(segmentFill({ ...base, index: 1, currentIndex: 1 })).toBe(1);
  });
});
