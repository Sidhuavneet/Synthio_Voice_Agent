import { afterEach, describe, expect, it, vi } from "vitest";
import { MIC_MODE_KEY, parseMicMode, readMicMode, saveMicMode } from "@/lib/mic-mode";

describe("parseMicMode", () => {
  it("accepts the two modes and defaults to open mic", () => {
    expect(parseMicMode("open")).toBe("open");
    expect(parseMicMode("tap")).toBe("tap");
    expect(parseMicMode(null)).toBe("open");
    expect(parseMicMode("TAP")).toBe("open");
    expect(parseMicMode('"tap"')).toBe("open");
  });
});

describe("readMicMode / saveMicMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips through localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(readMicMode()).toBe("open");
    saveMicMode("tap");
    expect(store.get(MIC_MODE_KEY)).toBe("tap");
    expect(readMicMode()).toBe("tap");
    saveMicMode("open");
    expect(readMicMode()).toBe("open");
  });

  it("falls back to open mic when storage throws", () => {
    const fail = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("window", { localStorage: { getItem: fail, setItem: fail } });
    expect(readMicMode()).toBe("open");
    expect(() => saveMicMode("tap")).not.toThrow();
  });

  it("falls back to open mic without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(readMicMode()).toBe("open");
    expect(() => saveMicMode("tap")).not.toThrow();
  });
});
