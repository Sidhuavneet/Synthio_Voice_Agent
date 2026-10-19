/** Returns a user-facing message for an unknown thrown value. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
