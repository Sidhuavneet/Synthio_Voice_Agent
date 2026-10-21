import type { Deck, Slide } from "@/lib/types";

export interface Citation {
  /** Index into `Deck.sources`. */
  id: number;
  text: string;
}

/** The deck sources backing a slide (contract §3), skipping ids that don't resolve. */
export function getSlideCitations(
  deck: Pick<Deck, "sources">,
  slide: Pick<Slide, "sourceIds">,
): Citation[] {
  return slide.sourceIds.flatMap((id) => {
    const text = deck.sources[id];
    return text === undefined ? [] : [{ id, text }];
  });
}
