"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SlideTime, Slide } from "@/lib/types";

export interface TimelineSnapshot {
  durationSec: number;
  slides: SlideTime[];
}

interface Timeline {
  totalsMs: Map<number, number>;
  current: { index: number; since: number } | null;
}

function elapsedTotals(timeline: Timeline, now: number): Map<number, number> {
  const totals = new Map(timeline.totalsMs);
  const { current } = timeline;
  if (current) totals.set(current.index, (totals.get(current.index) ?? 0) + now - current.since);
  return totals;
}

/**
 * Measures how long each slide was on screen while the presenter was synced. This is the
 * frontend's own copy of the report facts, shown if the agent's `session.report` fails.
 */
export function useSlideTimeline(
  slides: Slide[],
  index: number,
  isSynced: boolean,
): () => TimelineSnapshot {
  const timeline = useRef<Timeline>({ totalsMs: new Map(), current: null });

  useEffect(() => {
    const now = Date.now();
    const state = timeline.current;
    state.totalsMs = elapsedTotals(state, now);
    state.current = isSynced ? { index, since: now } : null;
  }, [index, isSynced]);

  return useCallback(() => {
    const totals = elapsedTotals(timeline.current, Date.now());
    const slideTimes = slides.map((slide) => ({
      index: slide.index,
      title: slide.title,
      timeSec: Math.round((totals.get(slide.index) ?? 0) / 1000),
    }));
    const totalMs = [...totals.values()].reduce((sum, ms) => sum + ms, 0);
    return { durationSec: Math.round(totalMs / 1000), slides: slideTimes };
  }, [slides]);
}
