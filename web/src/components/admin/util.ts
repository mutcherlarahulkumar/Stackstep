import { Bounds, normalizeLine } from "@/lib/validation";

/** Normalized search text, clipped to the server's 100-character limit. */
export function normalizeLineSafe(raw: string): string {
  return [...normalizeLine(raw)].slice(0, Bounds.searchMax).join("");
}
