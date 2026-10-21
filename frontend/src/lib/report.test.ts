import { describe, expect, it } from "vitest";
import { formatFollowUpEmail, parseSessionReportResponse } from "@/lib/report";
import type { SessionReport } from "@/lib/types";

const report: SessionReport = {
  deckId: "tenvoryx",
  durationSec: 300,
  summary: "The user asked about dosing and reported dizziness.",
  slides: [{ index: 0, title: "Intro", timeSec: 60 }],
  questions: [{ question: "What is the dose?", slideIndex: 0, answered: false }],
  complianceFlags: [
    { id: "f", category: "adverse_event", question: "Dizzy after starting", slideIndex: 0, timestamp: 1 },
  ],
  followUps: [
    {
      kind: "adverse_event",
      text: "Report dizziness to safety",
      aeCriteria: {
        identifiablePatient: true,
        identifiableReporter: true,
        suspectProduct: true,
        adverseEvent: false,
      },
    },
    { kind: "medical_information", text: "Send the dosing answer", aeCriteria: null },
  ],
  interests: [],
};

describe("parseSessionReportResponse follow-ups", () => {
  it("keeps typed follow-ups and drops criteria outside adverse events", () => {
    const parsed = parseSessionReportResponse(
      JSON.stringify({
        ok: true,
        ...report,
        followUps: [
          report.followUps[0],
          { kind: "follow_up", text: "Send leaflet", aeCriteria: report.followUps[0].aeCriteria },
          { kind: "new_kind", text: "Something new" },
          "a bare string",
          { kind: "follow_up", text: "  " },
        ],
      }),
    );
    expect(parsed.ok && parsed.followUps).toEqual([
      report.followUps[0],
      { kind: "follow_up", text: "Send leaflet", aeCriteria: null },
      { kind: "follow_up", text: "Something new", aeCriteria: null },
    ]);
  });
});

describe("formatFollowUpEmail", () => {
  it("lists actions with missing criteria, open questions and flags", () => {
    const email = formatFollowUpEmail(
      { title: "Tenvoryx", disclaimer: "Fictional product." },
      report,
      (flag) => flag.category,
    );
    expect(email).toContain("Subject: Follow-up: Tenvoryx");
    expect(email).toContain(
      "- [Adverse event report] Report dizziness to safety (still to collect: adverse event)",
    );
    expect(email).toContain("- What is the dose? (open)");
    expect(email).toContain('- adverse_event: "Dizzy after starting"');
    expect(email.endsWith("Fictional product.")).toBe(true);
  });
});
