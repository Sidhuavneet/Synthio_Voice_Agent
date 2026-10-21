/** Runtime type guards for validating JSON received from the agent. */

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

export function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

/** Keeps the array items that pass `parse` (which returns null to reject an item). */
export function parseList<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(parse).filter((item): item is T => item !== null);
}

export function parseString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Parses a JSON string, returning undefined instead of throwing on malformed input. */
export function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
