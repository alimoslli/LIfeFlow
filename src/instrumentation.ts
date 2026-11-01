import type { Instrumentation } from "next";

/** Server errors go to error alerts (services/error-reports.ts). Never throws. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("./server/services/error-reports");
    const { getDb } = await import("./server/db/client");
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
    await recordError(getDb(), { source: "server", route: context.routePath || request.path, message, digest });
  } catch {
    // Reporting must never make things worse.
  }
};
