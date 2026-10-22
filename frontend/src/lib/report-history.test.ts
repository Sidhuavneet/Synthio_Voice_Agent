import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ENTRY_CHARS,
  MAX_REPORTS,
  REPORTS_KEY,
  buildEntry,
  clearReports,
  listReports,
  mergeReports,
  parseReports,
  saveReport,
  type SaveReportInput,
} from "@/lib/report-history";
import type { SessionReport } from "@/lib/types";

function report(deckId = "deck"): SessionReport {
  return {
    deckId,
    durationSec: 120,
    slides: [{ index: 0, title: "Intro", timeSec: 60 }],
    complianceFlags: [],
    summary: "A short session.",
    questions: [{ question: "Why?", slideIndex: 0, answered: true }],
    followUps: [],
    interests: ["outcomes"],
  };
}

function input(endedAt: number, transcript: unknown[] = []): SaveReportInput {
  return { report: report(), transcript, deckId: "deck", deckTitle: "Deck", endedAt };
}

let data: Map<string, string>;
let failWrites: (value: string) => boolean;

beforeEach(() => {
  data = new Map();
  failWrites = () => false;
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites(value)) throw new DOMException("full", "QuotaExceededError");
        data.set(key, value);
      },
      removeItem: (key: string) => void data.delete(key),
    },
    dispatchEvent: () => true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveReport / listReports", () => {
  it("saves and lists newest first", () => {
    saveReport(input(1, [{ role: "user", text: "hi" }]));
    saveReport(input(3));
    saveReport(input(2));
    const list = listReports();
    expect(list.map((entry) => entry.endedAt)).toEqual([3, 2, 1]);
    expect(list[2]).toMatchObject({
      id: "deck:1",
      deckId: "deck",
      deckTitle: "Deck",
      report: report(),
      transcript: [{ role: "user", text: "hi" }],
      transcriptDropped: false,
    });
  });

  it("replaces the same session instead of duplicating it", () => {
    saveReport(input(1));
    saveReport({ ...input(1), deckTitle: "Renamed" });
    expect(listReports()).toHaveLength(1);
    expect(listReports()[0].deckTitle).toBe("Renamed");
  });

  it(`keeps only the latest ${MAX_REPORTS}`, () => {
    for (let i = 1; i <= MAX_REPORTS + 3; i += 1) saveReport(input(i));
    const list = listReports();
    expect(list).toHaveLength(MAX_REPORTS);
    expect(list[0].endedAt).toBe(MAX_REPORTS + 3);
    expect(list.at(-1)?.endedAt).toBe(4);
    // A report older than everything kept is not stored.
    expect(saveReport(input(0))).toBeNull();
  });

  it("applies a transcript parser", () => {
    saveReport(input(1, ["a", 2, "b"]));
    const parse = (item: unknown) => (typeof item === "string" ? item : null);
    expect(listReports(parse)[0].transcript).toEqual(["a", "b"]);
  });

  it("clears all reports", () => {
    saveReport(input(1));
    clearReports();
    expect(data.has(REPORTS_KEY)).toBe(false);
    expect(listReports()).toEqual([]);
  });
});

describe("corrupt data", () => {
  it("tolerates malformed JSON and non-arrays", () => {
    expect(parseReports("{not json")).toEqual([]);
    expect(parseReports('{"a":1}')).toEqual([]);
    expect(parseReports(null)).toEqual([]);
  });

  it("drops malformed entries and keeps valid ones", () => {
    const valid = {
      deckId: "deck",
      deckTitle: "Deck",
      endedAt: 5,
      report: report(),
      transcript: [],
    };
    const raw = JSON.stringify([
      null,
      { ...valid, endedAt: "yesterday" },
      { ...valid, report: { ...report(), summary: 3 } },
      { ...valid, endedAt: 4, transcript: "not a list" },
      valid,
      valid,
    ]);
    const list = parseReports(raw);
    expect(list.map((entry) => entry.endedAt)).toEqual([5, 4]);
    expect(list[1].transcript).toEqual([]);
  });

  it("recovers from corrupt storage on the next save", () => {
    data.set(REPORTS_KEY, "garbage");
    expect(saveReport(input(1))).not.toBeNull();
    expect(listReports()).toHaveLength(1);
  });
});

describe("size limits", () => {
  it("drops an oversized transcript but keeps the report", () => {
    const transcript = ["x".repeat(MAX_ENTRY_CHARS)];
    const entry = buildEntry(input(1, transcript));
    expect(entry).toMatchObject({ transcript: [], transcriptDropped: true });
  });

  it("refuses a report that is too large on its own", () => {
    const huge = { ...input(1), report: { ...report(), summary: "x".repeat(MAX_ENTRY_CHARS) } };
    expect(buildEntry(huge)).toBeNull();
    expect(saveReport(huge)).toBeNull();
    expect(data.has(REPORTS_KEY)).toBe(false);
  });

  it("drops the oldest reports to fit the total budget", () => {
    const entries = [1, 2, 3].map((i) => buildEntry(input(i))!);
    const oneSize = JSON.stringify([entries[0]]).length;
    const merged = mergeReports(entries.slice(0, 2), entries[2], oneSize * 2 + 10);
    expect(merged.map((entry) => entry.endedAt)).toEqual([3, 2]);
  });

  it("retries with fewer reports when storage is full", () => {
    saveReport(input(1));
    saveReport(input(2));
    // Fail any write that still holds both older reports.
    failWrites = (value) => value.includes('"endedAt":1') && value.includes('"endedAt":2');
    expect(saveReport(input(3))).not.toBeNull();
    expect(listReports().map((entry) => entry.endedAt)).toEqual([3, 2]);
  });

  it("returns null when storage is unavailable", () => {
    failWrites = () => true;
    expect(saveReport(input(1))).toBeNull();
  });
});
