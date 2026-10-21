import {
  isFiniteNumber,
  isNonNegativeInteger,
  isNullableNumber,
  isRecord,
  parseJson,
} from "@/lib/guards";
import type {
  AgentEvent,
  ComplianceCategory,
  ComplianceFlag,
  SessionErrorCode,
  SessionErrorEvent,
  TurnMetrics,
} from "@/lib/types";

const COMPLIANCE_CATEGORIES: ReadonlySet<string> = new Set<ComplianceCategory>([
  "off_label",
  "personal_medical_advice",
  "adverse_event",
  "out_of_scope",
]);

function isComplianceCategory(value: unknown): value is ComplianceCategory {
  return typeof value === "string" && COMPLIANCE_CATEGORIES.has(value);
}

/** Validates a `compliance_flag` payload (the `type` field is not required). */
export function parseComplianceFlag(value: unknown): ComplianceFlag | null {
  if (!isRecord(value)) return null;
  const { id, category, question, slideIndex, timestamp } = value;
  if (
    typeof id !== "string" ||
    !isComplianceCategory(category) ||
    typeof question !== "string" ||
    !isNonNegativeInteger(slideIndex) ||
    !isFiniteNumber(timestamp)
  ) {
    return null;
  }
  return { id, category, question, slideIndex, timestamp };
}

const SESSION_ERROR_CODES: ReadonlySet<string> = new Set<SessionErrorCode>([
  "quota_exceeded",
  "provider_error",
  "internal",
]);

const FALLBACK_SESSION_ERROR = "The presenter ran into a problem and had to stop.";

function parseSessionError(value: unknown): SessionErrorEvent | null {
  if (!isRecord(value)) return null;
  const { code, message } = value;
  if (typeof code !== "string") return null;
  return {
    // An unknown code from a newer agent is still an error worth showing.
    code: SESSION_ERROR_CODES.has(code) ? (code as SessionErrorCode) : "internal",
    message: typeof message === "string" && message.trim() ? message : FALLBACK_SESSION_ERROR,
  };
}

function parseTurnMetrics(value: unknown): TurnMetrics | null {
  if (!isRecord(value)) return null;
  const { turnId, sttMs, eouMs, llmTtftMs, ttsTtfbMs, totalMs } = value;
  if (
    typeof turnId !== "string" ||
    !isNullableNumber(sttMs) ||
    !isNullableNumber(eouMs) ||
    !isNullableNumber(llmTtftMs) ||
    !isNullableNumber(ttsTtfbMs) ||
    !isNullableNumber(totalMs)
  ) {
    return null;
  }
  return { turnId, sttMs, eouMs, llmTtftMs, ttsTtfbMs, totalMs };
}

const decoder = new TextDecoder();

/** Decodes a `synthio.events` data packet (contract §5); returns null for unknown or malformed events. */
export function parseAgentEvent(payload: Uint8Array): AgentEvent | null {
  const value = parseJson(decoder.decode(payload));
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "compliance_flag": {
      const flag = parseComplianceFlag(value);
      return flag && { type: "compliance_flag", ...flag };
    }
    case "session_error": {
      const error = parseSessionError(value);
      return error && { type: "session_error", ...error };
    }
    case "turn_metrics": {
      const metrics = parseTurnMetrics(value);
      return metrics && { type: "turn_metrics", ...metrics };
    }
    default:
      return null;
  }
}
