/** Shared by the practice pad and its worker. Keep the worker import out of this file. */

export type CaseStatus = "pass" | "fail" | "error" | "timeout";
export type CaseResult = { index: number; status: CaseStatus; actual: string | null; error: string | null; ms: number };
export type RunResult = { cases: CaseResult[]; logs: string[]; setupError: string | null };

export type RunRequest = { code: string; functionName: string; tests: { args: unknown[]; expected: unknown }[] };
export type WorkerMessage = { type: "case"; result: CaseResult } | { type: "log"; line: string } | { type: "setup-error"; message: string } | { type: "done" };

/** JSON with object keys sorted, so {a,b} and {b,a} compare equal. */
export function canonical(v: unknown): string {
  return JSON.stringify(sortKeys(v)) ?? "undefined";
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

export const sameValue = (a: unknown, b: unknown) => canonical(a) === canonical(b);
