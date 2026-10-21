/** Parsers for the agent participant's attributes (contract §5). Malformed values are ignored. */

function parseIndex(raw: string | undefined, count: number): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value < count ? value : null;
}

/** `slide.index` -> a valid slide index, or null. */
export function parseSlideIndex(raw: string | undefined, slideCount: number): number | null {
  return parseIndex(raw, slideCount);
}

/** `slide.point` -> the point being narrated, or null for "-1" (Q&A, idle) and invalid values. */
export function parsePointIndex(raw: string | undefined, pointCount: number): number | null {
  return parseIndex(raw, pointCount);
}

/** `slide.presented` ("0,1,2") -> sorted, de-duplicated, in-range slide indices. */
export function parsePresented(raw: string | undefined, slideCount: number): number[] {
  if (!raw) return [];
  const indices = raw
    .split(",")
    .map((part) => parseIndex(part, slideCount))
    .filter((index): index is number => index !== null);
  return [...new Set(indices)].sort((a, b) => a - b);
}
