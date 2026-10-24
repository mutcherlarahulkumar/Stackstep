"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Coins, Eye, Lightbulb, Lock, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { type AIQuestionInput } from "@/lib/api/client";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type AIConversationDetail, type AIMessage, type Task, type Wallet } from "@/lib/api/schemas";
import { AIBounds, countdown, hasErrors, PROMPT_TIPS, validateFollowUp, validateQuestion } from "@/lib/ai";
import { dateTimeLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { runeLength } from "@/lib/validation";
import { aiConversationsKey, useWallet, walletKey } from "@/lib/wallet-queries";

import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { SafeMarkdown } from "./markdown";
import { Quip } from "../app/loading";

export function AIAvatar({ size = "default" }: { size?: "sm" | "default" | "lg" }) {
  return (
    <Avatar size={size}>
      <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
        <Sparkles className="size-[55%]" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

const NO_TASK = "none";

/**
 * The students' AI study helper. Questions must be explained in one go, cost a credit, and
 * follow-ups open only after the student has had time to try the last hint.
 */
export function AIHelper({ tasks, onBack }: { tasks: readonly Task[]; onBack?: () => void }) {
  const wallet = useWallet();
  const [open, setOpen] = useState<string | "new" | null>(null);
  const { api } = useSession();
  const list = useQuery({ queryKey: aiConversationsKey, queryFn: () => api.aiConversations() });

  const header = (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-4">
      {onBack || open ? (
        <Button variant="ghost" size="icon" onClick={() => (open ? setOpen(null) : onBack?.())} aria-label={open ? "All AI questions" : "All chats"}>
          <ArrowLeft aria-hidden />
        </Button>
      ) : null}
      <AIAvatar />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">AI helper</h2>
        <p className="text-muted-foreground truncate text-xs">Hints, not answers · 1 credit per question</p>
      </div>
      {wallet.data ? <Usage wallet={wallet.data} /> : null}
    </div>
  );

  if (wallet.isPending) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="p-4">
          <ListSkeleton rows={3} className="h-16" />
        </div>
      </div>
    );
  }
  if (wallet.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <ErrorState message={messageFor(wallet.error)} onRetry={() => void wallet.refetch()} />
      </div>
    );
  }
  if (!wallet.data.ai.enabled) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState icon={Sparkles} title="The AI helper isn't set up yet">
            Your admin hasn&apos;t turned it on. Ask your managers in their chats; they reply by hand.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ai-helper">
      {header}
      {open === "new" ? (
        <QuestionForm tasks={tasks} wallet={wallet.data} onAsked={(id) => setOpen(id)} />
      ) : open ? (
        <ConversationView key={open} id={open} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            <Button size="lg" className="h-11 self-start" onClick={() => setOpen("new")} data-testid="ai-new">
              <MessageSquarePlus data-icon="inline-start" aria-hidden /> Ask a question
            </Button>
            <HowToUse />
            <section aria-label="Your questions">
              <h3 className="mb-2 text-sm font-medium">Your questions</h3>
              {list.isPending ? (
                <ListSkeleton rows={3} className="h-12" />
              ) : list.isError ? (
                <ErrorState message={messageFor(list.error)} onRetry={() => void list.refetch()} />
              ) : list.data.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing yet. Try first, then ask when you&apos;re stuck.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {list.data.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(c.id)}
                        className="hover:bg-muted/70 focus-visible:ring-ring flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none focus-visible:ring-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                        <span className="text-muted-foreground shrink-0 text-xs">{dateTimeLabel(c.updated_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Usage({ wallet }: { wallet: Wallet }) {
  const left = Math.max(0, wallet.ai.daily_limit - wallet.ai.used_today);
  return (
    <div className="text-muted-foreground hidden flex-col items-end text-xs sm:flex" data-testid="ai-usage">
      <span className="text-foreground inline-flex items-center gap-1 font-medium tabular-nums">
        <Coins className="text-primary size-3.5" aria-hidden /> {wallet.credits.balance} credits
      </span>
      <span className="tabular-nums">{left} questions left today</span>
    </div>
  );
}

function HowToUse() {
  return (
    <section aria-label="How to ask well" className="bg-muted/40 rounded-xl border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="text-warning size-4" aria-hidden /> Learn to write good prompts
      </h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Spend some time on the problem yourself first: read the error, check the docs, try one fix. Then explain everything in one go. A clear
        question gets a useful hint the first time and saves your credits.
      </p>
      <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs" data-testid="ai-privacy-note">
        <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Mentors can read your helper chats. Questions are sent to an AI provider, so don&apos;t paste passwords, keys or personal details.{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-4">
            Privacy
          </Link>
        </span>
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {PROMPT_TIPS.map((t) => (
          <li key={t.title} className="text-sm">
            <span className="font-medium">{t.title}.</span> <span className="text-muted-foreground">{t.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = runeLength(value.trim());
  return (
    <span className={cn("text-xs tabular-nums", n > max ? "text-destructive" : "text-muted-foreground")}>
      {n} / {max}
    </span>
  );
}

function QuestionForm({ tasks, wallet, onAsked }: { tasks: readonly Task[]; wallet: Wallet; onAsked: (id: string) => void }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState<AIQuestionInput>({ task_id: null, goal: "", tried: "", error: "", code: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One id per draft: a retry after a dropped connection is never charged twice.
  const clientId = useRef<string>(crypto.randomUUID());
  const nextAt = wallet.ai.next_question_at;
  const now = useNow(nextAt !== null);
  const wait = countdown(nextAt, now);
  const outOfQuestions = wallet.ai.used_today >= wallet.ai.daily_limit;
  const noCredits = wallet.credits.balance < wallet.ai.cost_per_question;
  const helpable = tasks.filter((t) => t.type !== "quiz" && t.status !== "cancelled");
  const set = (k: keyof AIQuestionInput, v: string | null) => {
    setQ((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    const e = validateQuestion(q);
    setErrors(e);
    setFormError(null);
    if (hasErrors(e)) return;
    setBusy(true);
    try {
      const d = await api.askAI(clientId.current, { ...q, goal: q.goal.trim(), tried: q.tried.trim(), error: q.error.trim(), code: q.code.trim() });
      qc.setQueryData(walletKey, d.wallet);
      qc.setQueryData(["ai-conversation", d.conversation.id], d);
      void qc.invalidateQueries({ queryKey: aiConversationsKey });
      onAsked(d.conversation.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_failed") setErrors(err.fields);
      else setFormError(messageFor(err));
      // The server stored nothing for a rejected or failed question, so a new try gets a new id.
      if (err instanceof ApiError) clientId.current = crypto.randomUUID();
      void qc.invalidateQueries({ queryKey: walletKey });
    } finally {
      setBusy(false);
    }
  };

  const blocked = outOfQuestions ? "You've used today's questions. They reset at midnight." : noCredits ? "You're out of credits. Finish tasks to earn more, or ask your admin." : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <form
        noValidate
        className="mx-auto flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-label="Ask the AI helper"
      >
        <Alert>
          <Lightbulb aria-hidden />
          <AlertTitle>Explain it in one go</AlertTitle>
          <AlertDescription>
            The helper only knows what you write here. Fill every box you can: goal, what you tried, the exact error and the code. You get hints and
            a next step, not a finished solution.
          </AlertDescription>
        </Alert>
        {formError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t ask</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ai-task">About a task (optional)</FieldLabel>
            <Select value={q.task_id ?? NO_TASK} onValueChange={(v) => set("task_id", v === NO_TASK ? null : v)}>
              <SelectTrigger id="ai-task" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TASK}>Not about a specific task</SelectItem>
                {helpable.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>The task&apos;s brief is shared as context. Quizzes aren&apos;t available here.</FieldDescription>
          </Field>
          <Field data-invalid={!!errors.goal}>
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="ai-goal">What are you trying to do?</FieldLabel>
              <Counter value={q.goal} max={AIBounds.goalMax} />
            </div>
            <Textarea id="ai-goal" rows={2} value={q.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. Filter the task list by status without reloading the page." aria-invalid={!!errors.goal} />
            {errors.goal ? <FieldError>{errors.goal}</FieldError> : null}
          </Field>
          <Field data-invalid={!!errors.tried}>
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="ai-tried">What have you tried so far?</FieldLabel>
              <Counter value={q.tried} max={AIBounds.triedMax} />
            </div>
            <Textarea id="ai-tried" rows={3} value={q.tried} onChange={(e) => set("tried", e.target.value)} placeholder="The docs you read, the fixes you attempted, and what each one did." aria-invalid={!!errors.tried} />
            {errors.tried ? <FieldError>{errors.tried}</FieldError> : <FieldDescription>At least a couple of sentences. This is the most useful part.</FieldDescription>}
          </Field>
          <Field data-invalid={!!errors.error}>
            <FieldLabel htmlFor="ai-error">What happens instead? (optional)</FieldLabel>
            <Textarea id="ai-error" rows={2} value={q.error} onChange={(e) => set("error", e.target.value)} placeholder="Paste the exact error, or what you expected vs what you got." aria-invalid={!!errors.error} />
            {errors.error ? <FieldError>{errors.error}</FieldError> : null}
          </Field>
          <Field data-invalid={!!errors.code}>
            <div className="flex items-baseline justify-between">
              <FieldLabel htmlFor="ai-code">Relevant code (optional)</FieldLabel>
              <Counter value={q.code} max={AIBounds.codeMax} />
            </div>
            <Textarea id="ai-code" rows={6} className="font-mono text-sm" value={q.code} onChange={(e) => set("code", e.target.value)} placeholder="Only the part that matters. Never paste passwords or API keys." aria-invalid={!!errors.code} />
            {errors.code ? <FieldError>{errors.code}</FieldError> : null}
          </Field>
        </FieldGroup>
        {blocked ? (
          <p className="text-destructive text-sm" role="alert">
            {blocked}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" className="h-11" disabled={busy || !!blocked || !!wait} data-testid="ai-ask">
            {busy ? <Spinner data-icon="inline-start" /> : wait ? <Clock data-icon="inline-start" aria-hidden /> : <Send data-icon="inline-start" aria-hidden />}
            {busy ? "Thinking…" : wait ? `Next question in ${wait}` : `Ask · ${wallet.ai.cost_per_question} credit`}
          </Button>
          <span className="text-muted-foreground text-xs">
            {wallet.credits.balance} credits · {Math.max(0, wallet.ai.daily_limit - wallet.ai.used_today)} questions left today
          </span>
        </div>
        {busy ? <AIThinking /> : null}
      </form>
    </div>
  );
}

function StudentTurn({ m }: { m: AIMessage }) {
  const p = m.parts;
  return (
    <li className="flex justify-end">
      <div className={cn("bg-primary text-primary-foreground max-w-[min(38rem,90%)] rounded-2xl rounded-br-md px-4 py-3 text-sm", m.status === "failed" && "opacity-60")}>
        {p && m.kind === "question" ? (
          <dl className="flex flex-col gap-2">
            <Part label="Trying to do" value={p.goal} />
            <Part label="Tried" value={p.tried} />
            {p.error ? <Part label="What happens" value={p.error} /> : null}
            {p.code ? (
              <div>
                <dt className="text-xs font-medium opacity-80">Code</dt>
                <dd>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-black/20 p-2 font-mono text-xs">{p.code}</pre>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : p ? (
          <dl className="flex flex-col gap-2">
            <Part label="Tried since" value={p.tried_since} />
            <Part label="Question" value={p.question} />
          </dl>
        ) : (
          <p className="whitespace-pre-wrap">{m.body}</p>
        )}
        {m.status === "failed" ? <p className="mt-2 text-xs">No answer came back. Your credit was refunded.</p> : null}
      </div>
    </li>
  );
}

function Part({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium opacity-80">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

export function AITurns({ messages }: { messages: AIMessage[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((m) =>
        m.role === "student" ? (
          <StudentTurn key={m.id} m={m} />
        ) : (
          <li key={m.id} className="flex gap-2.5" data-testid="ai-answer">
            <span className="mt-0.5 shrink-0" aria-hidden>
              <AIAvatar size="sm" />
            </span>
            <div className="bg-muted max-w-[min(42rem,92%)] rounded-2xl rounded-bl-md px-4 py-3">
              <span className="sr-only">AI helper: </span>
              <SafeMarkdown>{m.body}</SafeMarkdown>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

function ConversationView({ id }: { id: string }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ["ai-conversation", id], queryFn: () => api.aiConversation(id) });
  if (q.isPending) {
    return (
      <div className="p-4">
        <ListSkeleton rows={3} className="h-20" />
      </div>
    );
  }
  if (q.isError) return <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" role="log" aria-label={`AI helper: ${q.data.conversation.title}`}>
        <AITurns messages={q.data.messages} />
      </div>
      <FollowUp detail={q.data} />
    </div>
  );
}

function FollowUp({ detail }: { detail: AIConversationDetail }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [triedSince, setTriedSince] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const clientId = useRef<string>(crypto.randomUUID());
  const opensAt = detail.follow_up_at;
  const now = useNow(opensAt !== null);
  const wait = countdown(opensAt, now);
  const w = detail.wallet;

  if (detail.follow_ups_left === 0) {
    return (
      <div className="text-muted-foreground border-t px-4 py-3 text-sm sm:px-6">
        This conversation is full. Start a new question with everything you&apos;ve learned so far.
      </div>
    );
  }
  if (wait) {
    return (
      <div className="flex items-center gap-3 border-t px-4 py-3 sm:px-6" data-testid="ai-cooldown">
        <Lock className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <p className="text-sm">
          <span className="font-medium">Try the hint yourself first.</span>{" "}
          <span className="text-muted-foreground">
            Follow-ups open in <span className="tabular-nums">{wait}</span>. Working it out on your own is how it sticks.
          </span>
        </p>
      </div>
    );
  }

  const submit = async () => {
    const e = validateFollowUp({ tried_since: triedSince, body });
    setErrors(e);
    if (hasErrors(e)) return;
    setBusy(true);
    try {
      const d = await api.followUpAI(detail.conversation.id, clientId.current, { tried_since: triedSince.trim(), body: body.trim() });
      qc.setQueryData(["ai-conversation", d.conversation.id], d);
      qc.setQueryData(walletKey, d.wallet);
      setTriedSince("");
      setBody("");
      clientId.current = crypto.randomUUID();
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_failed") setErrors(err.fields);
      else toast.error(messageFor(err));
      if (err instanceof ApiError) clientId.current = crypto.randomUUID();
      void qc.invalidateQueries({ queryKey: ["ai-conversation", detail.conversation.id] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Follow up"
    >
      <Field data-invalid={!!errors.tried_since}>
        <FieldLabel htmlFor="ai-tried-since">What did you try after the last answer?</FieldLabel>
        <Textarea id="ai-tried-since" rows={2} value={triedSince} onChange={(e) => setTriedSince(e.target.value)} aria-invalid={!!errors.tried_since} />
        {errors.tried_since ? <FieldError>{errors.tried_since}</FieldError> : null}
      </Field>
      <Field data-invalid={!!errors.body}>
        <FieldLabel htmlFor="ai-follow-up">Your follow-up question</FieldLabel>
        <Textarea id="ai-follow-up" rows={2} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!errors.body} />
        {errors.body ? <FieldError>{errors.body}</FieldError> : null}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || w.credits.balance < w.ai.cost_per_question} data-testid="ai-follow-up-send">
          {busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden />}
          {busy ? "Thinking…" : `Follow up · ${w.ai.cost_per_question} credit`}
        </Button>
        <span className="text-muted-foreground text-xs">
          {detail.follow_ups_left} follow-up{detail.follow_ups_left === 1 ? "" : "s"} left · {w.credits.balance} credits
        </span>
      </div>
      {busy ? <AIThinking /> : null}
    </form>
  );
}

/** Shown while Groq answers: typing dots and a rotating line, so the wait feels alive. */
function AIThinking() {
  const ref = useRef<HTMLDivElement>(null);
  // The card appears under a long form; bring it into view so the wait is visible.
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must
  // not return anything but a cleanup function (React would call the Promise on unmount).
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  return (
    <div ref={ref} role="status" aria-label="The AI helper is thinking" className="animate-enter bg-muted/40 flex items-center gap-3 rounded-xl border p-3" data-testid="ai-thinking">
      <AIAvatar size="sm" />
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="bg-foreground/40 size-1.5 animate-bounce rounded-full" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      <Quip className="flex-1 text-left" seed={7} />
    </div>
  );
}
