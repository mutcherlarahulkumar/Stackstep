/**
 * DSA practice pad: runs the student's JavaScript against example tests in a Web Worker on
 * their own device. Tests are JSON data from admins; nothing here runs anyone else's code.
 */
import { type Practice } from "./api/schemas";
import { type RunRequest, type RunResult, type WorkerMessage } from "./practice-core";

export { canonical, sameValue, type CaseResult, type CaseStatus, type RunResult } from "./practice-core";

/** Whole-run time limit; an infinite loop is stopped and the rest marked as timed out. */
export const RUN_TIMEOUT_MS = 3000;
export const MAX_LOG_LINES = 50;

/** "twoSum([2,7,11,15], 9)" */
export function callLabel(fn: string, args: unknown[]): string {
  return `${fn}(${args.map((a) => JSON.stringify(a) ?? "undefined").join(", ")})`;
}

export function summary(r: RunResult, total: number): string {
  if (r.setupError) return "Your code didn't load";
  const passed = r.cases.filter((c) => c.status === "pass").length;
  return passed === total ? `All ${total} examples pass` : `${passed} of ${total} examples pass`;
}

/** A hand-in note with the code and how the examples went (≤ 4000 characters). */
export function handInNote(code: string, result: RunResult | null, total: number, max = 4000): string {
  const header = result ? `Practice pad. ${summary(result, total)} (run in my browser).` : "Practice pad code (not run).";
  const fence = "```js\n";
  const room = max - header.length - fence.length - "\n```\n\nApproach and complexity, ".length;
  const body = code.length > room ? `${code.slice(0, Math.max(0, room - 20))}\n// …trimmed` : code;
  return `${header}\n\n${fence}${body.trimEnd()}\n\`\`\`\n\nApproach and complexity, `;
}

const key = (taskId: string) => `stackstep:practice:${taskId}`;

/** The draft lives in this browser only; storage may be unavailable (private mode). */
export function loadDraft(taskId: string): { code: string; result: RunResult | null } | null {
  try {
    const raw = localStorage.getItem(key(taskId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: unknown; result?: unknown };
    return typeof v.code === "string" ? { code: v.code, result: (v.result as RunResult | null | undefined) ?? null } : null;
  } catch {
    return null;
  }
}

export function saveDraft(taskId: string, code: string, result: RunResult | null): void {
  try {
    localStorage.setItem(key(taskId), JSON.stringify({ code, result }));
  } catch {
    // Storage full or blocked: the pad still works for this visit.
  }
}

/** Runs the code in a fresh worker; resolves when done or when the time limit stops it. */
export function runPractice(code: string, practice: Practice, timeoutMs = RUN_TIMEOUT_MS): Promise<RunResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./practice.worker.ts", import.meta.url), { type: "module" });
    const result: RunResult = { cases: [], logs: [], setupError: null };
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
      for (let i = 0; i < practice.tests.length; i++) {
        if (!result.cases.some((c) => c.index === i)) result.cases.push({ index: i, status: "timeout", actual: null, error: "Stopped after 3 seconds. Look for an endless loop.", ms: 0 });
      }
      result.cases.sort((a, b) => a.index - b.index);
      resolve(result);
    };
    const timer = setTimeout(finish, timeoutMs);
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      switch (m.type) {
        case "case":
          result.cases.push(m.result);
          break;
        case "log":
          if (result.logs.length < MAX_LOG_LINES) result.logs.push(m.line);
          break;
        case "setup-error":
          result.setupError = m.message;
          for (let i = 0; i < practice.tests.length; i++) result.cases.push({ index: i, status: "error", actual: null, error: m.message, ms: 0 });
          finish();
          break;
        case "done":
          finish();
          break;
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      result.setupError = e.message || "Your code couldn't run.";
      finish();
    };
    const req: RunRequest = { code, functionName: practice.function_name, tests: practice.tests };
    worker.postMessage(req);
  });
}
