import type { Slide } from "@/lib/types";

/** How many of the most recently spoken words are compared against the slide (contract §5). */
export const SPOKEN_WINDOW_WORDS = 12;
/** A candidate must share at least this many distinct content words with the spoken window… */
export const MIN_SHARED_WORDS = 2;
/** …and those shared words must cover at least this fraction of the candidate's content words. */
export const MIN_COVERAGE = 0.25;

export type HighlightTarget = { kind: "bullet"; index: number } | { kind: "stat" };

const STOP_WORDS = new Set(
  (
    "a about after again all also an and any are as at be because been before being but by can " +
    "could did do does doing down during each even for from further had has have having he her " +
    "here hers him his how i if in into is it its just let like may me more most much must my no " +
    "nor not now of off on once only or other our out over own really same she should so some " +
    "such than that the their them then there these they this those through to too under until " +
    "up us very was we were what when where which while who whom why will with would you your " +
    "yours okay right well next slide here's that's let's it's we're you're there's"
  ).split(" "),
);

/** Lowercase content words with a light plural/possessive normalisation. */
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .map((word) => word.replace(/'s$/, ""))
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word,
    )
    .filter((word) => word.length > 1 || /\p{N}/u.test(word));
}

/** The last `SPOKEN_WINDOW_WORDS` words of `text`, before stop-word filtering. */
export function lastWords(text: string, count = SPOKEN_WINDOW_WORDS): string {
  return text.trim().split(/\s+/).slice(-count).join(" ");
}

interface Candidate {
  target: HighlightTarget;
  words: ReadonlySet<string>;
}

function candidates(slide: Pick<Slide, "bullets" | "stat">): Candidate[] {
  const list: Candidate[] = slide.bullets.map((bullet, index) => ({
    target: { kind: "bullet", index },
    words: new Set(contentWords(bullet)),
  }));
  if (slide.stat) {
    list.push({
      target: { kind: "stat" },
      words: new Set(contentWords(`${slide.stat.value} ${slide.stat.label}`)),
    });
  }
  return list;
}

/**
 * Finds the bullet (or stat) the presenter is most likely talking about, from the tail of the
 * agent's spoken transcript. Returns null when no candidate clears the threshold, so callers
 * can keep the previous highlight.
 */
export function matchSpokenTarget(
  slide: Pick<Slide, "bullets" | "stat">,
  spokenText: string,
): HighlightTarget | null {
  const spoken = new Set(contentWords(lastWords(spokenText)));
  if (spoken.size === 0) return null;

  let best: { target: HighlightTarget; shared: number; coverage: number } | null = null;
  for (const { target, words } of candidates(slide)) {
    if (words.size === 0) continue;
    let shared = 0;
    for (const word of words) if (spoken.has(word)) shared += 1;
    const coverage = shared / words.size;
    if (shared < MIN_SHARED_WORDS || coverage < MIN_COVERAGE) continue;
    if (
      !best ||
      shared > best.shared ||
      (shared === best.shared && coverage > best.coverage)
    ) {
      best = { target, shared, coverage };
    }
  }
  return best?.target ?? null;
}

export function isSameTarget(a: HighlightTarget | null, b: HighlightTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "stat" || b.kind === "stat") return a.kind === b.kind;
  return a.index === b.index;
}
