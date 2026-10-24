/**
 * Runs a student's own practice code. Network and script loading are switched off first, so
 * the code can only compute. The page stops this worker after RUN_TIMEOUT_MS.
 */
import { canonical, type CaseResult, type RunRequest, type WorkerMessage } from "./practice-core";

type Scope = { postMessage: (m: WorkerMessage) => void; onmessage: ((e: MessageEvent<RunRequest>) => void) | null } & Record<string, unknown>;
const scope = self as unknown as Scope;

for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel"]) {
  try {
    Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
  } catch {
    scope[name] = undefined;
  }
}

const show = (v: unknown): string => {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

const log = (...parts: unknown[]) => scope.postMessage({ type: "log", line: parts.map(show).join(" ").slice(0, 500) });
const sandboxConsole = { log, info: log, warn: log, error: log, debug: log };

scope.onmessage = (e: MessageEvent<RunRequest>) => {
  const { code, functionName, tests } = e.data;
  let fn: unknown;
  try {
    // The student's own code, run on purpose: this is the practice pad's job.
    const load = new Function("console", `"use strict";\n${code}\nreturn typeof ${functionName} === "function" ? ${functionName} : undefined;`) as (c: typeof sandboxConsole) => unknown;
    fn = load(sandboxConsole);
  } catch (err) {
    scope.postMessage({ type: "setup-error", message: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    return;
  }
  if (typeof fn !== "function") {
    scope.postMessage({ type: "setup-error", message: `Define a function named ${functionName}.` });
    return;
  }
  const call = fn as (...args: unknown[]) => unknown;
  tests.forEach((t, index) => {
    const started = performance.now();
    let result: CaseResult;
    try {
      const actual = call(...(structuredClone(t.args) as unknown[]));
      const ms = Math.round(performance.now() - started);
      const pass = canonical(actual) === canonical(t.expected);
      result = { index, status: pass ? "pass" : "fail", actual: show(actual), error: null, ms };
    } catch (err) {
      result = { index, status: "error", actual: null, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), ms: Math.round(performance.now() - started) };
    }
    scope.postMessage({ type: "case", result });
  });
  scope.postMessage({ type: "done" });
};
