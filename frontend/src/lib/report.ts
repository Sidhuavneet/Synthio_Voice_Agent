import { parseComplianceFlag } from "@/lib/events";
import {
  isFiniteNumber,
  isNonNegativeInteger,
  isRecord,
  parseJson,
  parseList,
  parseString,
} from "@/lib/guards";
import type {
  AdverseEventCriteria,
  ComplianceFlag,
  Deck,
  FollowUp,
  FollowUpKind,
  ReportQuestion,
  SessionReport,
  SessionReportResponse,
  SlideTime,
} from "@/lib/types";

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

const FOLLOW_UP_KINDS: ReadonlySet<string> = new Set<FollowUpKind>([
  "adverse_event",
  "medical_information",
  "follow_up",
]);

function parseAeCriteria(value: unknown): AdverseEventCriteria | null {
  if (!isRecord(value)) return null;
  const { identifiablePatient, identifiableReporter, suspectProduct, adverseEvent } = value;
  if (
    typeof identifiablePatient !== "boolean" ||
    typeof identifiableReporter !== "boolean" ||
    typeof suspectProduct !== "boolean" ||
    typeof adverseEvent !== "boolean"
  ) {
    return null;
  }
  return { identifiablePatient, identifiableReporter, suspectProduct, adverseEvent };
}

function parseFollowUp(value: unknown): FollowUp | null {
  if (!isRecord(value)) return null;
  const { kind, text, aeCriteria } = value;
  if (typeof text !== "string" || !text.trim()) return null;
  const known = typeof kind === "string" && FOLLOW_UP_KINDS.has(kind);
  return {
    kind: known ? (kind as FollowUpKind) : "follow_up",
    text,
    aeCriteria: kind === "adverse_event" ? parseAeCriteria(aeCriteria) : null,
  };
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
  const followUps = parseList(value.followUps, parseFollowUp);
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

const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = {
  adverse_event: "Adverse event report",
  medical_information: "Medical information",
  follow_up: "Follow-up",
};

const CRITERIA_LABELS: Record<keyof AdverseEventCriteria, string> = {
  identifiablePatient: "identifiable patient",
  identifiableReporter: "identifiable reporter",
  suspectProduct: "suspect product",
  adverseEvent: "adverse event",
};

function followUpLine(item: FollowUp): string {
  const line = `- [${FOLLOW_UP_LABELS[item.kind]}] ${item.text}`;
  if (item.kind !== "adverse_event") return line;
  if (!item.aeCriteria) return `${line} (reporting criteria not assessed)`;
  const criteria = item.aeCriteria;
  const missing = (Object.keys(CRITERIA_LABELS) as (keyof AdverseEventCriteria)[])
    .filter((key) => !criteria[key])
    .map((key) => CRITERIA_LABELS[key]);
  return missing.length > 0 ? `${line} (still to collect: ${missing.join(", ")})` : line;
}

/** Plain-text hand-off of a finished report, for pasting into an email or CRM note. */
export function formatFollowUpEmail(
  deck: Pick<Deck, "title" | "disclaimer">,
  report: SessionReport,
  complianceLabel: (flag: ComplianceFlag) => string,
): string {
  const sections = [`Subject: Follow-up: ${deck.title}`, report.summary];
  if (report.followUps.length > 0) {
    sections.push(["Actions:", ...report.followUps.map(followUpLine)].join("\n"));
  }
  if (report.questions.length > 0) {
    sections.push(
      [
        "Questions asked:",
        ...report.questions.map((q) => `- ${q.question}${q.answered ? "" : " (open)"}`),
      ].join("\n"),
    );
  }
  if (report.complianceFlags.length > 0) {
    sections.push(
      [
        "Compliance flags:",
        ...report.complianceFlags.map((flag) => `- ${complianceLabel(flag)}: "${flag.question}"`),
      ].join("\n"),
    );
  }
  sections.push(deck.disclaimer);
  return sections.filter((section) => section.trim()).join("\n\n");
}
