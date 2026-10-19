"use client";

import { useAgent } from "@livekit/components-react";
import { DECK_ID_ATTRIBUTE, SLIDE_INDEX_ATTRIBUTE } from "@/lib/protocol";

export interface SlideSync {
  /** Slide to render; 0 until the agent publishes `slide.index` for this deck. */
  index: number;
  /** True once the agent has joined, loaded this deck (`deck.id`) and published a valid slide index. */
  isSynced: boolean;
}

/** Reads the current slide from the agent participant's `slide.index` / `deck.id` attributes (contract §5). */
export function useSlideSync(deckId: string, slideCount: number): SlideSync {
  const agent = useAgent();
  const raw = agent.attributes[SLIDE_INDEX_ATTRIBUTE];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  const isSameDeck = agent.attributes[DECK_ID_ATTRIBUTE] === deckId;
  const isValid = isSameDeck && Number.isInteger(parsed) && parsed >= 0 && parsed < slideCount;
  const hasAgent = agent.identity !== undefined;

  return { index: isValid ? parsed : 0, isSynced: hasAgent && isValid };
}
