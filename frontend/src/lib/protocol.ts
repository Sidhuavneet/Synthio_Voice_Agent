/** Realtime protocol names from docs/CONTRACT.md §5. */

export const SLIDE_INDEX_ATTRIBUTE = "slide.index";
export const DECK_ID_ATTRIBUTE = "deck.id";
/** Index of the point being narrated, "-1" when none. */
export const SLIDE_POINT_ATTRIBUTE = "slide.point";
/** Comma-separated indices of fully presented slides, e.g. "0,1,2". */
export const SLIDE_PRESENTED_ATTRIBUTE = "slide.presented";
export const NAVIGATE_RPC_METHOD = "slides.navigate";
export const EVENTS_TOPIC = "synthio.events";
export const REPORT_RPC_METHOD = "session.report";
/** The agent generates the report with an LLM call, so allow longer than the 15 s default. */
export const REPORT_RPC_TIMEOUT_MS = 30_000;
