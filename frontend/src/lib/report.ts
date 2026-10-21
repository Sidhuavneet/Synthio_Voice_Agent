import { parseComplianceFlag } from "@/lib/events";
import {
  isFiniteNumber,
  isNonNegativeInteger,
  isRecord,
  parseJson,
  parseList,
  parseString,
} from "@/lib/guards";
import type { ReportQuestion, SessionReportResponse, SlideTime } from "@/lib/types";

const UNEXPECTED_RESPONSE = "The presenter sent an unexpected report.";

function parseSlideTime(value: unknown): SlideTime | null {
  if (!isRecord(value)) return null;
  const { index, title, timeSec } = value;
  if (!isNonNegativeInteger(index) || typeof title !== "string" || !isFiniteNumber(timeSec)) {
    return null;
  }
  return { index, title, timeSec };
}

function parseQuestion(value: unknown): ReportQuestion | null {
  if (!isRecord(value)) return null;
  const { question, slideIndex, answered } = value;
  if (
    typeof question !== "string" ||
    !isNonNegativeInteger(slideIndex) ||
    typeof answered !== "boolean"
  ) {
    return null;
  }
  return { question, slideIndex, answered };
}

/**
 * Validates a `session.report` RPC response (contract §5). Malformed list items are dropped;
 * a missing or mistyped top-level field turns the whole response into an error.
 */
export function parseSessionReportResponse(raw: string): SessionReportResponse {
  const value = parseJson(raw);
  if (!isRecord(value)) return { ok: false, error: UNEXPECTED_RESPONSE };
  if (value.ok === false) {
    return {
      ok: false,
      error: typeof value.error === "string" ? value.error : UNEXPECTED_RESPONSE,
    };
  }

  const slides = parseList(value.slides, parseSlideTime);
  const questions = parseList(value.questions, parseQuestion);
  const complianceFlags = parseList(value.complianceFlags, parseComplianceFlag);
  const followUps = parseList(value.followUps, parseString);
  const interests = parseList(value.interests, parseString);
  const { deckId, durationSec, summary } = value;
  if (
    value.ok !== true ||
    typeof deckId !== "string" ||
    !isFiniteNumber(durationSec) ||
    typeof summary !== "string" ||
    !slides ||
    !questions ||
    !complianceFlags ||
    !followUps ||
    !interests
  ) {
    return { ok: false, error: UNEXPECTED_RESPONSE };
  }
  return {
    ok: true,
    deckId,
    durationSec,
    summary,
    slides,
    questions,
    complianceFlags,
    followUps,
    interests,
  };
}
