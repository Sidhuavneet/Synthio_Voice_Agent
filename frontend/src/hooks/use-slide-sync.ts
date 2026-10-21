"use client";

import { useMemo } from "react";
import { useAgent } from "@livekit/components-react";
import { parsePointIndex, parsePresented, parseSlideIndex } from "@/lib/agent-attributes";
import {
  DECK_ID_ATTRIBUTE,
  SLIDE_INDEX_ATTRIBUTE,
  SLIDE_POINT_ATTRIBUTE,
  SLIDE_PRESENTED_ATTRIBUTE,
} from "@/lib/protocol";
import type { Deck } from "@/lib/types";

export interface SlideSync {
  /** Slide to render; 0 until the agent publishes `slide.index` for this deck. */
  index: number;
  /** True once the agent has joined, loaded this deck (`deck.id`) and published a valid slide index. */
  isSynced: boolean;
  /** Point being narrated on the current slide (`slide.point`), or null. */
  pointIndex: number | null;
  /** Slides fully presented so far (`slide.presented`), sorted. */
  presented: number[];
}

/** Reads the presentation state from the agent participant's attributes (contract §5). */
export function useSlideSync(deck: Pick<Deck, "id" | "slides">): SlideSync {
  const agent = useAgent();
  const { attributes } = agent;
  const slideCount = deck.slides.length;
  const isSameDeck = attributes[DECK_ID_ATTRIBUTE] === deck.id;
  const parsed = isSameDeck ? parseSlideIndex(attributes[SLIDE_INDEX_ATTRIBUTE], slideCount) : null;
  const index = parsed ?? 0;
  const isSynced = agent.identity !== undefined && parsed !== null;

  const rawPresented = isSameDeck ? attributes[SLIDE_PRESENTED_ATTRIBUTE] : undefined;
  // Keyed on the raw string so the array keeps its identity until the attribute changes.
  const presented = useMemo(
    () => parsePresented(rawPresented, slideCount),
    [rawPresented, slideCount],
  );

  const pointIndex = isSynced
    ? parsePointIndex(attributes[SLIDE_POINT_ATTRIBUTE], deck.slides[index].points.length)
    : null;

  return { index, isSynced, pointIndex, presented };
}
