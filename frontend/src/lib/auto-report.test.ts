import { describe, expect, it } from "vitest";
import { AUTO_REPORT_DELAY_MS, autoReportPhase, countdownSeconds } from "@/lib/auto-report";

describe("autoReportPhase", () => {
  it("is inactive until the presentation has finished", () => {
    expect(autoReportPhase({ finished: false, quiet: true, cancelled: false })).toBe("inactive");
    expect(autoReportPhase({ finished: false, quiet: true, cancelled: true })).toBe("inactive");
  });

  it("counts down only while everyone is quiet", () => {
    expect(autoReportPhase({ finished: true, quiet: true, cancelled: false })).toBe("counting");
    expect(autoReportPhase({ finished: true, quiet: false, cancelled: false })).toBe("paused");
  });

  it("stays cancelled once the user chose to stay", () => {
    expect(autoReportPhase({ finished: true, quiet: true, cancelled: true })).toBe("cancelled");
  });
});

describe("countdownSeconds", () => {
  it("rounds up to whole seconds and stops at zero", () => {
    expect(countdownSeconds(1_000, 1_000, AUTO_REPORT_DELAY_MS)).toBe(10);
    expect(countdownSeconds(1_000, 1_001, AUTO_REPORT_DELAY_MS)).toBe(10);
    expect(countdownSeconds(1_000, 2_000, AUTO_REPORT_DELAY_MS)).toBe(9);
    expect(countdownSeconds(1_000, 10_999, AUTO_REPORT_DELAY_MS)).toBe(1);
    expect(countdownSeconds(1_000, 11_000, AUTO_REPORT_DELAY_MS)).toBe(0);
    expect(countdownSeconds(1_000, 60_000, AUTO_REPORT_DELAY_MS)).toBe(0);
  });
});
