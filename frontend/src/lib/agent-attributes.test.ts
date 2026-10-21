import { describe, expect, it } from "vitest";
import { parsePointIndex, parsePresented, parseSlideIndex } from "@/lib/agent-attributes";

describe("parseSlideIndex", () => {
  it("accepts in-range integers", () => {
    expect(parseSlideIndex("0", 5)).toBe(0);
    expect(parseSlideIndex("4", 5)).toBe(4);
  });

  it("rejects missing, malformed and out-of-range values", () => {
    for (const raw of [undefined, "", " ", "5", "-1", "1.5", "abc"]) {
      expect(parseSlideIndex(raw, 5)).toBeNull();
    }
  });
});

describe("parsePointIndex", () => {
  it("maps -1 (no point) to null", () => {
    expect(parsePointIndex("-1", 4)).toBeNull();
  });

  it("returns the narrated point", () => {
    expect(parsePointIndex("2", 4)).toBe(2);
  });

  it("ignores points the slide doesn't have", () => {
    expect(parsePointIndex("3", 3)).toBeNull();
  });
});

describe("parsePresented", () => {
  it("parses a comma-separated list into sorted unique indices", () => {
    expect(parsePresented("2,0,2,1", 5)).toEqual([0, 1, 2]);
  });

  it("drops invalid entries and tolerates spaces", () => {
    expect(parsePresented("0, 1,x,9,-1,", 5)).toEqual([0, 1]);
  });

  it("returns an empty list when absent", () => {
    expect(parsePresented(undefined, 5)).toEqual([]);
    expect(parsePresented("", 5)).toEqual([]);
  });
});
