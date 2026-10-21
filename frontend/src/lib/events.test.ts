import { describe, expect, it } from "vitest";
import { parseAgentEvent } from "@/lib/events";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("parseAgentEvent", () => {
  it("parses session_error events", () => {
    expect(
      parseAgentEvent(
        encode({ type: "session_error", code: "quota_exceeded", message: "Quota used up." }),
      ),
    ).toEqual({ type: "session_error", code: "quota_exceeded", message: "Quota used up." });
  });

  it("keeps a session_error with an unknown code or empty message", () => {
    const event = parseAgentEvent(encode({ type: "session_error", code: "new_code", message: "" }));
    expect(event).toMatchObject({ type: "session_error", code: "internal" });
    expect(event && "message" in event && event.message.length).toBeGreaterThan(0);
  });

  it("rejects a session_error without a code", () => {
    expect(parseAgentEvent(encode({ type: "session_error", message: "x" }))).toBeNull();
  });

  it("parses compliance flags and ignores unknown events", () => {
    const flag = {
      id: "f1",
      category: "adverse_event",
      question: "I got a rash",
      slideIndex: 1,
      timestamp: 1_700_000_000_000,
    };
    expect(parseAgentEvent(encode({ type: "compliance_flag", ...flag }))).toEqual({
      type: "compliance_flag",
      ...flag,
    });
    expect(parseAgentEvent(encode({ type: "something_else" }))).toBeNull();
    expect(parseAgentEvent(new TextEncoder().encode("not json"))).toBeNull();
  });
});
