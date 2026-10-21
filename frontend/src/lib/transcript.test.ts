import { describe, expect, it } from "vitest";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import { mergeRows } from "@/lib/transcript";

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
