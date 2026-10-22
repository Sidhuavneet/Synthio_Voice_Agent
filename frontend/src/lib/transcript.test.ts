import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import type { SlideTrigger } from "@/lib/types";
import {
  formatTranscript,
  markerText,
  mergeRows,
  parseTranscriptRow,
  type TranscriptRow,
} from "@/lib/transcript";

interface Message {
  id: string;
  /** Timeline entries received when the message was first seen. */
  entriesBefore: number;
}

const change = (toIndex: number, timestamp = 0): TimelineEntry => ({
  type: "slide_changed",
  fromIndex: 0,
  toIndex,
  trigger: "auto",
  reason: null,
  question: null,
  timestamp,
});

const backchannel: TimelineEntry = {
  type: "interruption",
  kind: "backchannel",
  slideIndex: 0,
  pointIndex: null,
  detectionMs: 100,
  timestamp: 0,
};

const label = (entry: TimelineEntry) =>
  entry.type === "slide_changed" ? `slide ${entry.toIndex}` : entry.kind;

const order = (messages: Message[], timeline: TimelineEntry[]) =>
  mergeRows(messages, (message) => message.entriesBefore, timeline).map((row) =>
    row.kind === "message" ? row.message.id : label(row.entry),
  );

describe("mergeRows", () => {
  it("interleaves markers in arrival order", () => {
    const messages = [
      { id: "a", entriesBefore: 0 },
      { id: "b", entriesBefore: 1 },
    ];
    expect(order(messages, [change(1), change(2)])).toEqual(["a", "slide 1", "b", "slide 2"]);
  });

  it("ignores the agent's clock, which may be skewed from the browser's", () => {
    // A typed question, the jump it caused (stamped an hour ahead), then the spoken answer.
    const messages = [
      { id: "typed", entriesBefore: 0 },
      { id: "answer", entriesBefore: 1 },
    ];
    expect(order(messages, [change(1, Date.now() + 3_600_000)])).toEqual([
      "typed",
      "slide 1",
      "answer",
    ]);
  });

  it("skips backchannels and keeps markers newer than every message", () => {
    const messages = [{ id: "a", entriesBefore: 1 }];
    expect(order(messages, [backchannel, change(3)])).toEqual(["a", "slide 3"]);
  });
});

describe("formatTranscript", () => {
  const slides = [{ title: "Intro" }, { title: "Rehab" }];

  it("labels speakers as the session does and keeps markers in order", () => {
    const rows: TranscriptRow[] = [
      {
        kind: "message",
        message: { id: "a", fromUser: false, text: "Welcome." },
      },
      { kind: "marker", entry: change(1) },
      {
        kind: "message",
        message: { id: "b", fromUser: true, text: "How long is rehab?" },
      },
    ];
    expect(formatTranscript(rows, "Dr. Lee", slides)).toBe(
      ["Dr. Lee: Welcome.", "— Slide 2 · Rehab —", "You: How long is rehab?"].join("\n"),
    );
  });

  it("describes question jumps, returns and barge-ins", () => {
    const moved = (toIndex: number, trigger: SlideTrigger, reason: string | null = null) =>
      ({ ...change(toIndex), trigger, reason }) as TimelineEntry;
    expect(markerText(moved(1, "question", "rehab timeline"), slides)).toBe(
      "Jumped to Slide 2 · Rehab to answer: rehab timeline",
    );
    expect(markerText(moved(0, "resume"), slides)).toBe("Back to Slide 1 · Intro");
    expect(markerText({ ...backchannel, kind: "barge_in", detectionMs: 320 }, slides)).toMatch(
      /^You cut in · detected in /,
    );
    expect(markerText(change(5), slides)).toBe("Slide 6");
  });
});

describe("parseTranscriptRow", () => {
  it("keeps valid message and marker rows", () => {
    const message = {
      kind: "message",
      message: { id: "m1", fromUser: true, text: "Hi" },
    };
    const marker = {
      kind: "marker",
      entry: { type: "slide_changed", index: 2 },
    };
    expect(parseTranscriptRow(message)).toEqual(message);
    expect(parseTranscriptRow(marker)).toEqual(marker);
  });

  it("rejects malformed rows", () => {
    expect(parseTranscriptRow(null)).toBeNull();
    expect(
      parseTranscriptRow({
        kind: "message",
        message: { id: 1, fromUser: true, text: "x" },
      }),
    ).toBeNull();
    expect(parseTranscriptRow({ kind: "marker", entry: {} })).toBeNull();
    expect(parseTranscriptRow({ kind: "other" })).toBeNull();
  });
});
