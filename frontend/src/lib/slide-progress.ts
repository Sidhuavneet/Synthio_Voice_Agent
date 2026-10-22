/**
 * Fill levels for the segmented slide progress bar: presented slides are full, the current
 * slide fills as its points are narrated, the rest are empty.
 */

/** Furthest point narrated so far, per slide index. */
export type FurthestPoints = Readonly<Record<number, number>>;

/**
 * Records that `pointIndex` of `slideIndex` is being narrated. Returns `furthest` itself when
 * nothing moved forward, so it can be kept in React state without extra renders.
 */
export function recordPoint(
  furthest: FurthestPoints,
  slideIndex: number,
  pointIndex: number | null,
): FurthestPoints {
  if (pointIndex === null || pointIndex < 0) return furthest;
  const previous = furthest[slideIndex];
  if (previous !== undefined && previous >= pointIndex) return furthest;
  return { ...furthest, [slideIndex]: pointIndex };
}

/**
 * Share of a slide narrated while `pointIndex` plays. The intro and each point are equal
 * parts, and a part counts once it has played, so a slide is only full once presented.
 */
export function narrationProgress(pointIndex: number | undefined, pointCount: number): number {
  if (pointIndex === undefined || pointIndex < 0 || pointCount <= 0) return 0;
  return Math.min(pointIndex + 1, pointCount) / (pointCount + 1);
}

export interface SegmentFillInput {
  index: number;
  currentIndex: number;
  presented: ReadonlySet<number>;
  furthest: FurthestPoints;
  pointCount: number;
}

/** How full a slide's segment is, from 0 to 1. */
export function segmentFill({
  index,
  currentIndex,
  presented,
  furthest,
  pointCount,
}: SegmentFillInput): number {
  if (presented.has(index)) return 1;
  if (index !== currentIndex) return 0;
  return narrationProgress(furthest[index], pointCount);
}
