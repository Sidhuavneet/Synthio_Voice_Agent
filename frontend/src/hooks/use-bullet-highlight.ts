"use client";

import { useState } from "react";
import type { ReceivedMessage } from "@livekit/components-react";
import { isSameTarget, matchSpokenTarget, type HighlightTarget } from "@/lib/bullet-match";
import type { Slide } from "@/lib/types";

interface SpokenPosition {
  messageId: string;
  length: number;
}

interface HighlightState {
  slideIndex: number;
  /** Where the agent's transcript stood when this slide appeared; earlier words belong to the previous slide. */
  start: SpokenPosition | null;
  target: HighlightTarget | null;
}

function latestAgentMessage(messages: ReceivedMessage[]): ReceivedMessage | undefined {
  return messages.findLast((message) => message.type === "agentTranscript");
}

function positionOf(message: ReceivedMessage | undefined): SpokenPosition | null {
  return message ? { messageId: message.id, length: message.message.length } : null;
}

/**
 * Tracks the bullet (or stat) the presenter is currently talking about (contract §5,
 * frontend-only). The agent's transcription is synced to its audio, so its tail is what is
 * being said right now. Keeps the previous highlight when nothing matches; resets on slide change.
 */
export function useBulletHighlight(
  slide: Slide,
  messages: ReceivedMessage[],
): HighlightTarget | null {
  const spoken = latestAgentMessage(messages);
  const [state, setState] = useState<HighlightState>(() => ({
    slideIndex: slide.index,
    start: positionOf(spoken),
    target: null,
  }));

  if (state.slideIndex !== slide.index) {
    setState({ slideIndex: slide.index, start: positionOf(spoken), target: null });
    return null;
  }

  let text = spoken?.message ?? "";
  if (spoken && spoken.id === state.start?.messageId) text = text.slice(state.start.length);
  const match = matchSpokenTarget(slide, text);
  if (match && !isSameTarget(match, state.target)) setState({ ...state, target: match });
  return match ?? state.target;
}
