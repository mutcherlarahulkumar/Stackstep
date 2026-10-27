import { ERROR_CODES, type ErrorCode } from "./schemas";

/** An error the API returned in its envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Null only when the server sent a code this build doesn't know. */
    readonly code: ErrorCode | null,
    message: string,
    readonly fields: Readonly<Record<string, string>> = {},
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The request never got a usable answer: offline, timeout, gateway error, or a contract violation. */
export class NetworkError extends Error {
  constructor(readonly causeDetail: string) {
    super(`Network error: ${causeDetail}`);
    this.name = "NetworkError";
  }
}

export function toErrorCode(raw: string): ErrorCode | null {
  return (ERROR_CODES as readonly string[]).includes(raw) ? (raw as ErrorCode) : null;
}

function rateLimited(seconds: number | null): string {
  if (seconds === null) return "You're going a bit fast. Try again shortly.";
  if (seconds >= 3600) return `You've hit today's message limit. It resets in ${Math.ceil(seconds / 3600)}h.`;
  if (seconds >= 60) return `Too many requests. Try again in ${Math.ceil(seconds / 60)} min.`;
  return `Too many requests. Try again in ${seconds}s.`;
}

/** Human copy for every error. Raw server messages are never shown. */
export function messageFor(error: unknown): string {
  if (error instanceof NetworkError) return "Can't reach Stackstep. Check your connection and try again.";
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "bad_request":
    case "payload_too_large":
      return "That request couldn't be processed.";
    case "unauthenticated":
      return "Your session expired. Please sign in again.";
    case "forbidden":
      return "You don't have access to this.";
    case "not_found":
      return "This was removed or never existed.";
    case "validation_failed":
      return Object.values(error.fields)[0] ?? "Check the highlighted fields.";
    case "invalid_transition":
      return "That change isn't possible right now. Refresh and try again.";
    case "version_conflict":
      return "Someone else changed this. We refreshed it for you.";
    case "enrollment_not_active":
      return "This internship is paused or finished.";
    case "no_active_enrollment":
      return "You don't have an active internship.";
    case "rate_limited":
      return rateLimited(error.retryAfterSeconds);
    case "invalid_state":
    case "invalid_code":
      return "That sign-in link expired. Please try again.";
    case "not_configured":
      return "This isn't set up on this server yet.";
    case "insufficient_credits":
      return "You're out of credits. Finish tasks to earn more, or ask your admin.";
    case "ai_unavailable":
      return "The AI helper couldn't answer right now. Your credit was refunded.";
    case "internal":
    case null:
      return "Something went wrong on our side. Please try again.";
  }
}

/** Copy for one failed row of a bulk action (roster import, flow assignment, broadcast). */
export function itemErrorMessage(e: { code: string; message: string; fields?: Record<string, string> | undefined }): string {
  return messageFor(new ApiError(0, toErrorCode(e.code), e.message, e.fields ?? {}));
}
