import type { ConnectionDetails, Deck, DeckSummary } from "@/lib/types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8500").replace(/\/+$/, "");

/** Error raised for any failed API call. `status` is 0 when the backend is unreachable. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  get isUnreachable(): boolean {
    return this.status === 0;
  }

  get isServiceUnavailable(): boolean {
    return this.status === 503;
  }
}

async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const { detail } = body as { detail: unknown };
      if (typeof detail === "string") return detail;
      // FastAPI 422 responses carry a list of validation errors.
      if (Array.isArray(detail)) return "The request was rejected by the server.";
    }
  } catch {
    // Non-JSON error body; fall through to the status text.
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, `Can't reach the presentation server at ${API_URL}.`);
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readDetail(response));
  }
  return (await response.json()) as T;
}

export function listDecks(signal?: AbortSignal): Promise<DeckSummary[]> {
  return request<DeckSummary[]>("/decks", { signal });
}

export function getDeck(deckId: string, signal?: AbortSignal): Promise<Deck> {
  return request<Deck>(`/decks/${encodeURIComponent(deckId)}`, { signal });
}

export function createSession(deckId: string): Promise<ConnectionDetails> {
  return request<ConnectionDetails>("/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deckId }),
  });
}
