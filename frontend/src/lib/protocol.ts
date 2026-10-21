/** Realtime protocol names from docs/CONTRACT.md §5. */

export const SLIDE_INDEX_ATTRIBUTE = "slide.index";
export const DECK_ID_ATTRIBUTE = "deck.id";
export const NAVIGATE_RPC_METHOD = "slides.navigate";
export const EVENTS_TOPIC = "synthio.events";
export const REPORT_RPC_METHOD = "session.report";
/** The agent generates the report with an LLM call, so allow longer than the 15 s default. */
export const REPORT_RPC_TIMEOUT_MS = 30_000;
