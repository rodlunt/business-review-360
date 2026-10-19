import { api } from "../api";

let lastReported = 0;
const MIN_INTERVAL_MS = 5000; // don't spam on rapid re-renders

export function reportError(error, context = {}) {
  const now = Date.now();
  if (now - lastReported < MIN_INTERVAL_MS) return;
  lastReported = now;

  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const stack = error instanceof Error ? error.stack : undefined;

  api
    .post(
      "/client-error",
      {
        message,
        stack,
        url: window.location.href,
        type: context.type ?? (error instanceof Error ? error.name : "Error"),
      },
      {
        skipOrganizationId: true,
      }
    )
    .catch(() => {});
}
