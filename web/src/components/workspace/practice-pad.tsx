"use client";

import { CircleCheck, CircleX, Clock, Code2, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { type Practice } from "@/lib/api/schemas";
import { callLabel, type CaseStatus, loadDraft, runPractice, type RunResult, saveDraft, summary } from "@/lib/practice";
import { cn } from "@/lib/utils";

const STATUS: Record<CaseStatus, { icon: typeof CircleCheck; label: string; className: string }> = {
  pass: { icon: CircleCheck, label: "Passed", className: "text-success" },
  fail: { icon: CircleX, label: "Wrong answer", className: "text-destructive" },
  error: { icon: TriangleAlert, label: "Error", className: "text-destructive" },
  timeout: { icon: Clock, label: "Timed out", className: "text-warning" },
};

/** Write a JavaScript solution and run the examples on this device. Nothing is sent until you hand in. */
export function PracticePad({ taskId, practice }: { taskId: string; practice: Practice }) {
  const [code, setCode] = useState(() => loadDraft(taskId)?.code ?? practice.starter);
  const [result, setResult] = useState<RunResult | null>(() => loadDraft(taskId)?.result ?? null);
  const [running, setRunning] = useState(false);
  const indentOk = useRef(true);

  // Saved on every change: a reload or a closed tab never loses work.
  useEffect(() => saveDraft(taskId, code, result), [taskId, code, result]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      setResult(await runPractice(code, practice));
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    const before = code;
    setCode(practice.starter);
    setResult(null);
    toast("Back to the starter code", { action: { label: "Undo", onClick: () => setCode(before) } });
  };

  return (
    <section aria-labelledby="practice-title" className="mt-6 flex flex-col gap-3" data-testid="practice-pad">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="practice-title" className="flex items-center gap-2 text-sm font-medium">
          <Code2 className="text-muted-foreground size-4" aria-hidden /> Practice pad
        </h3>
        <Badge variant="secondary">JavaScript · runs on this device</Badge>
      </div>
      <Textarea
        aria-label={`Your solution defines ${practice.function_name}`}
        aria-describedby="practice-keys"
        rows={12}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") indentOk.current = false;
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void run();
          } else if (e.key === "Tab" && !e.shiftKey && indentOk.current) {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: a, selectionEnd: b } = el;
            const next = `${code.slice(0, a)}  ${code.slice(b)}`;
            setCode(next);
            requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
          }
        }}
        onFocus={() => (indentOk.current = true)}
        className="bg-muted/30 min-h-60 font-mono text-[0.82rem] leading-relaxed"
        data-testid="practice-code"
      />
      {/* Keyboard help for screen readers (the editor's description); sighted users see it on the Run button. */}
      <p id="practice-keys" className="sr-only">
        Tab indents. Press Escape then Tab to leave the editor. Control plus Enter runs the examples.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run()} disabled={running} data-testid="practice-run" title="Ctrl + Enter">
          {running ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" aria-hidden />}
          Run examples
        </Button>
        <Button size="sm" variant="ghost" onClick={reset} disabled={running || code === practice.starter}>
          <RotateCcw data-icon="inline-start" aria-hidden /> Reset
        </Button>
        <span className="text-sm font-medium" aria-live="polite" data-testid="practice-summary">
          {running ? "Running…" : result ? summary(result, practice.tests.length) : ""}
        </span>
      </div>
      {result?.setupError ? (
        <p role="alert" className="text-destructive bg-destructive/10 rounded-md px-3 py-2 font-mono text-xs">
          {result.setupError}
        </p>
      ) : null}
      <ol className="flex flex-col divide-y rounded-lg border" aria-label="Examples">
        {practice.tests.map((t, i) => {
          const r = result?.cases.find((c) => c.index === i);
          const s = r ? STATUS[r.status] : null;
          const Icon = s?.icon;
          return (
            <li key={i} className="flex flex-col gap-1 px-3 py-2 text-xs" data-testid={`practice-case-${i}`}>
              <div className="flex items-start gap-2">
                {Icon && s ? <Icon className={cn("mt-0.5 size-4 shrink-0", s.className)} aria-label={s.label} /> : <span className="bg-muted-foreground/30 mt-1.5 size-2 shrink-0 rounded-full" aria-hidden />}
                <code className="min-w-0 flex-1 font-mono break-all">
                  {callLabel(practice.function_name, t.args)} → {JSON.stringify(t.expected)}
                </code>
                {r && r.status !== "timeout" ? <span className="text-muted-foreground shrink-0 tabular-nums">{r.ms} ms</span> : null}
              </div>
              {r && r.status === "fail" ? (
                <p className="text-muted-foreground pl-6 font-mono break-all">
                  got <span className="text-foreground">{r.actual}</span>
                </p>
              ) : null}
              {r && (r.status === "error" || r.status === "timeout") && !result?.setupError ? <p className="text-destructive pl-6 font-mono break-all">{r.error}</p> : null}
            </li>
          );
        })}
      </ol>
      {result && result.logs.length > 0 ? (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer select-none">Console ({result.logs.length})</summary>
          <pre className="bg-muted/40 mt-1 max-h-48 overflow-auto rounded-md border p-2 font-mono whitespace-pre-wrap">{result.logs.join("\n")}</pre>
        </details>
      ) : null}
      <p className="text-muted-foreground text-xs">Passing the examples is a self-check. Your reviewer reads the code you hand in; use “Insert my practice code” in the hand-in.</p>
    </section>
  );
}
