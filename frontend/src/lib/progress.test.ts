import { describe, expect, it } from "vitest";
import {
  hasProgress,
  isDeckComplete,
  parseProgress,
  progressKey,
  resumeSlideIndex,
  toResumeRequest,
  type DeckProgress,
} from "@/lib/progress";

const DECK = "acl-football";

function stored(value: Record<string, unknown>): string {
  return JSON.stringify({ deckId: DECK, slideIndex: 2, presented: [0, 1], updatedAt: 1, ...value });
}

function progress(slideIndex: number, presented: number[]): DeckProgress {
  return { deckId: DECK, slideIndex, presented, updatedAt: 1 };
}

describe("progressKey", () => {
  it("uses the contract's key", () => {
    expect(progressKey(DECK)).toBe("synthio.progress.acl-football");
  });
});

describe("isDeckComplete / hasProgress", () => {
  it("is complete only when every slide is presented", () => {
    expect(isDeckComplete([0, 1, 2], 3)).toBe(true);
    expect(isDeckComplete([0, 2], 3)).toBe(false);
    expect(isDeckComplete([0, 0, 1], 3)).toBe(false);
    expect(isDeckComplete([], 0)).toBe(false);
  });

  it("treats the untouched first slide as no progress", () => {
    expect(hasProgress(0, [])).toBe(false);
    expect(hasProgress(1, [])).toBe(true);
    expect(hasProgress(0, [0])).toBe(true);
  });
});

describe("parseProgress", () => {
  it("parses valid progress and normalises the presented list", () => {
    expect(parseProgress(stored({ presented: [1, 0, 1, 9] }), DECK, 5)).toEqual(
      progress(2, [0, 1]),
    );
  });

  it("rejects missing, malformed and foreign values", () => {
    expect(parseProgress(null, DECK, 5)).toBeNull();
    expect(parseProgress("{not json", DECK, 5)).toBeNull();
    expect(parseProgress(stored({ deckId: "other" }), DECK, 5)).toBeNull();
    expect(parseProgress(stored({ slideIndex: 5 }), DECK, 5)).toBeNull();
    expect(parseProgress(stored({ presented: "0,1" }), DECK, 5)).toBeNull();
    expect(parseProgress(stored({ updatedAt: "now" }), DECK, 5)).toBeNull();
  });

  it("ignores empty or finished progress", () => {
    expect(parseProgress(stored({ slideIndex: 0, presented: [] }), DECK, 5)).toBeNull();
    expect(parseProgress(stored({ presented: [0, 1, 2, 3, 4] }), DECK, 5)).toBeNull();
  });
});

describe("resumeSlideIndex", () => {
  it("resumes an unfinished slide where the user was", () => {
    expect(resumeSlideIndex(progress(2, [0, 1]), 5)).toBe(2);
  });

  it("moves past a slide that was already finished", () => {
    expect(resumeSlideIndex(progress(1, [0, 1]), 5)).toBe(2);
  });

  it("wraps to the first unpresented slide", () => {
    expect(resumeSlideIndex(progress(4, [1, 2, 3, 4]), 5)).toBe(0);
  });
});

describe("toResumeRequest", () => {
  it("builds the POST /api/session resume payload", () => {
    expect(toResumeRequest(progress(1, [0, 1]), 5)).toEqual({ slideIndex: 2, presented: [0, 1] });
  });
});
