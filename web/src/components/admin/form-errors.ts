import { ApiError, messageFor } from "@/lib/api/errors";

/** Splits a failed save into field errors (shown on inputs) and a form-level message. */
export function splitError(e: unknown): { fields: Record<string, string>; form: string | null } {
  if (e instanceof ApiError && e.code === "validation_failed" && Object.keys(e.fields).length) return { fields: e.fields, form: null };
  if (e instanceof ApiError && e.code === "version_conflict") return { fields: {}, form: "Someone else changed this meanwhile. Close and reopen to get the latest." };
  return { fields: {}, form: messageFor(e) };
}
