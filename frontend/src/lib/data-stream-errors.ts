import { DataStreamError, DataStreamErrorReason } from "livekit-client";

function isAbortedDataStream(error: unknown): boolean {
  return error instanceof DataStreamError && error.reason === DataStreamErrorReason.AbnormalEnd;
}

/**
 * Ending a session while the agent is mid-sentence aborts its in-flight transcription stream.
 * `@livekit/components-react` reads those streams through a bundled RxJS subscription without
 * an error handler, so the expected abort surfaces as an uncaught error (and the Next.js dev
 * overlay). Swallow only that error; call this from `instrumentation-client.ts` so the
 * listener is registered before any other.
 */
export function ignoreAbortedDataStreamErrors(): void {
  window.addEventListener(
    "error",
    (event) => {
      if (!isAbortedDataStream(event.error)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
}
