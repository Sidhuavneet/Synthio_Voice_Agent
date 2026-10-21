"use client";

import { useState } from "react";
import type { NarrationMark } from "@/lib/timeline";

/**
 * Tracks where narration of a point last started (`slide.point` changing to a point), relative
 * to the timeline entries received so far.
 */
export function useNarrationMark(
  slideIndex: number,
  pointIndex: number | null,
  timelineLength: number,
): NarrationMark | null {
  const [seen, setSeen] = useState({ slideIndex, pointIndex });
  const [mark, setMark] = useState<NarrationMark | null>(null);

  // Adjusts state during render (no effect): the mark must be in place before this render's
  // badges are derived from it.
  if (seen.slideIndex !== slideIndex || seen.pointIndex !== pointIndex) {
    setSeen({ slideIndex, pointIndex });
    if (pointIndex !== null) setMark({ slideIndex, afterEntries: timelineLength });
  }
  return mark;
}
