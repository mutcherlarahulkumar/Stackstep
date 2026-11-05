import { ApiError, NetworkError } from "./api/errors";

/** Which build crashed (Vercel exposes the commit; local builds say "local"). */
const RELEASE = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 12);

const sent = new Set<string>();

/** "TypeError: x is undefined": what the crash screen shows and what we log. */
export function errorSummary(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 500);
  return String(error).slice(0, 500);
}

/**
 * Sends a crash to the API log (POST /v1/client-errors) so it can be found without asking the
 * student. Fire and forget: never throws, sends each distinct error once per page load, and
 * skips request failures, which the screens already explain.
 */
export function reportError(error: unknown, where: string, digest = ""): void {
  if (error instanceof ApiError || error instanceof NetworkError) return;
  const message = errorSummary(error);
  const key = `${where}|${message}`;
  if (sent.has(key) || sent.size > 20) return;
  sent.add(key);
  const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 25).join("\n") : "";
  try {
    void fetch("/api/v1/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "web" },
      body: JSON.stringify({ where: where.slice(0, 80), message, stack: stack.slice(0, 12_000), path: location.pathname, digest: digest.slice(0, 80), release: RELEASE }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Reporting must never cause a second failure.
  }
}
