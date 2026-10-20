import { ignoreAbortedDataStreamErrors } from "@/lib/data-stream-errors";

// Registered here so it runs before other global error listeners, including the dev overlay.
ignoreAbortedDataStreamErrors();
