import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProgress,
  formatRelativeTime,
  hasProgress,
  isDeckComplete,
  nextProgressRecord,
  parseProgress,
  parseStoredProgress,
  readStoredProgress,
  saveProgress,
  summarizeProgress,
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

describe("parseStoredProgress (completion tracking)", () => {
  it("keeps a completed record with its completedAt", () => {
    expect(
      parseStoredProgress(stored({ presented: [0, 1, 2], completedAt: 9 }), DECK, 3),
    ).toEqual({ deckId: DECK, slideIndex: 2, presented: [0, 1, 2], updatedAt: 1, completedAt: 9 });
  });

  it("treats legacy all-presented data without completedAt as completed at updatedAt", () => {
    expect(parseStoredProgress(stored({ presented: [0, 1, 2] }), DECK, 3)?.completedAt).toBe(1);
  });

  it("ignores a stray completedAt on unfinished progress", () => {
    expect(parseStoredProgress(stored({ completedAt: 9 }), DECK, 5)).toEqual(progress(2, [0, 1]));
  });

  it("still rejects malformed values", () => {
    expect(parseStoredProgress("[]", DECK, 3)).toBeNull();
    expect(parseStoredProgress(stored({ slideIndex: -1 }), DECK, 3)).toBeNull();
  });
});

describe("parseProgress (resume offer)", () => {
  it("offers no resume for a completed deck", () => {
    expect(parseProgress(stored({ presented: [0, 1, 2], completedAt: 9 }), DECK, 3)).toBeNull();
  });
});

describe("summarizeProgress", () => {
  it("reports not started without data", () => {
    expect(summarizeProgress(null, DECK, 4)).toMatchObject({
      status: "not_started",
      presentedCount: 0,
      slideCount: 4,
      resumeIndex: null,
      updatedAt: null,
      progress: null,
    });
  });

  it("reports in progress with the resume slide", () => {
    expect(summarizeProgress(stored({ slideIndex: 1 }), DECK, 4)).toMatchObject({
      status: "in_progress",
      presentedCount: 2,
      resumeIndex: 2,
      updatedAt: 1,
      completedAt: null,
      progress: progress(1, [0, 1]),
    });
  });

  it("reports completed without a resume", () => {
    expect(
      summarizeProgress(stored({ presented: [0, 1, 2], completedAt: 7 }), DECK, 3),
    ).toMatchObject({ status: "completed", presentedCount: 3, resumeIndex: null, completedAt: 7 });
  });
});

describe("nextProgressRecord", () => {
  it("saves in-progress positions", () => {
    expect(nextProgressRecord(null, DECK, 3, 1, [0], 50)).toEqual({
      deckId: DECK,
      slideIndex: 1,
      presented: [0],
      updatedAt: 50,
    });
  });

  it("saves nothing at the untouched first slide", () => {
    expect(nextProgressRecord(null, DECK, 3, 0, [], 50)).toBeNull();
  });

  it("marks completion and keeps the first completion time", () => {
    const first = nextProgressRecord(progress(2, [0, 1]), DECK, 3, 2, [0, 1, 2], 50);
    expect(first).toMatchObject({ completedAt: 50, updatedAt: 50 });
    const again = nextProgressRecord(first, DECK, 3, 2, [0, 1, 2], 80);
    expect(again).toMatchObject({ completedAt: 50, updatedAt: 80 });
  });
});

describe("formatRelativeTime", () => {
  const now = 1_000_000_000_000;
  it("formats recent and older times", () => {
    expect(formatRelativeTime(now - 10_000, now, "en")).toBe("just now");
    expect(formatRelativeTime(now - 5 * 60_000, now, "en")).toBe("5 minutes ago");
    expect(formatRelativeTime(now - 2 * 3_600_000, now, "en")).toBe("2 hours ago");
    expect(formatRelativeTime(now - 24 * 3_600_000, now, "en")).toBe("yesterday");
  });
});

describe("storage access", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips through localStorage", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
      },
      dispatchEvent: () => true,
    });
    saveProgress({ ...progress(2, [0, 1, 2]), completedAt: 5 });
    expect(parseStoredProgress(readStoredProgress(DECK), DECK, 3)?.completedAt).toBe(5);
    clearProgress(DECK);
    expect(readStoredProgress(DECK)).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("window", {
      localStorage: { getItem: fail, setItem: fail, removeItem: fail },
      dispatchEvent: () => true,
    });
    expect(readStoredProgress(DECK)).toBeNull();
    expect(() => saveProgress(progress(1, [0]))).not.toThrow();
    expect(() => clearProgress(DECK)).not.toThrow();
  });
});
