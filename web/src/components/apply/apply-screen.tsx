"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CircleAlert,
  Copy,
  DoorClosed,
  Hourglass,
  PartyPopper,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  XCircle,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/errors";
import {
  type ApplicantAction,
  type ApplicantView,
  type Application,
  type Cohort,
  type Me,
} from "@/lib/api/schemas";
import {
  applyErrorMessage,
  detailsErrors,
  fileToBase64,
  flagHeadline,
  imageFileError,
  imageSrc,
  inr,
  liveApplication,
  proofErrors,
  PROOF_MAX_BYTES,
  stageFor,
  upiLink,
  type DetailsDraft,
} from "@/lib/apply";
import { isoDate } from "@/lib/dates";
import { firstName } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { landed } from "@/lib/landed";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { AppHeader } from "../app/app-header";
import { FileDrop } from "../app/file-drop";
import { SectionBoundary } from "../app/section-boundary";
import { SlowNote } from "../app/slow-note";
import { EmptyState, ErrorState } from "../app/state";
import { ApplicationChat } from "./application-chat";
import { ProofList } from "./proof-list";

const KEY = ["my-application"];

/** Anything larger is refused before reading; smaller ones are shrunk to well under 4 MB. */
const PICK_MAX_BYTES = 25 << 20;

class TooBig extends Error {}

/**
 * What a signed-in student without an internship sees: apply to an open cohort, pay by UPI,
 * then wait for an admin to confirm. Nothing from earlier cohorts shows here.
 */
export function ApplyScreen({ me }: { me: Me }) {
  const { api } = useSession();
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api.myApplication(),
    // Waiting on an admin: check every 15 seconds so a decision shows up on its own.
    refetchInterval: (query) => {
      const s = query.state.data?.application?.status;
      return s === "submitted" || s === "flagged" ? 15_000 : false;
    },
  });
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={me.user} />
      <main id="main" className="flex flex-1 justify-center px-4 py-6 sm:py-10">
        <div className="flex w-full max-w-3xl flex-col gap-6">
          {q.isPending ? (
            <div className="flex flex-col gap-4" aria-busy>
              <Skeleton className="h-10 w-72" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : q.isError ? (
            <ErrorState
              message={applyErrorMessage(q.error)}
              onRetry={() => void q.refetch()}
            />
          ) : (
            <SectionBoundary label="Your application">
              <Apply me={me} view={q.data} />
            </SectionBoundary>
          )}
        </div>
      </main>
    </div>
  );
}

type Mode = "status" | "edit" | "pay";

function Apply({ me, view }: { me: Me; view: ApplicantView }) {
  const { api, reloadMe } = useSession();
  const qc = useQueryClient();
  const stage = stageFor(view);
  const a = liveApplication(view);
  // Flagged students pick an action; rejected ones can start over.
  const [mode, setMode] = useState<Mode>("status");
  const [fresh, setFresh] = useState(false);
  const set = (v: ApplicantView) => qc.setQueryData(KEY, v);
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const onError = (e: unknown) => {
    toast.error(applyErrorMessage(e));
    if (
      e instanceof ApiError &&
      (e.code === "version_conflict" ||
        e.code === "invalid_state" ||
        e.code === "invalid_transition")
    )
      refresh();
  };
  // A sent message is added to what's on screen; nothing else reloads.
  const send = async (clientId: string, body: string) => {
    const m = await api.sendApplicationMessage(clientId, body);
    qc.setQueryData<ApplicantView>(KEY, (v) =>
      v && !v.messages.some((x) => x.id === m.id)
        ? { ...v, messages: [...v.messages, m] }
        : v,
    );
    return m;
  };

  if (stage === "closed") {
    return (
      <EmptyState
        icon={DoorClosed}
        title="Admissions are closed right now"
        action={
          <Button variant="outline" onClick={refresh}>
            <RefreshCw data-icon="inline-start" aria-hidden /> Check again
          </Button>
        }
      >
        Hi {firstName(me.user.name)}, no cohort is taking applications at the
        moment. New cohorts open every few weeks, so check back soon. If your
        college enrolled you, ask your placement cell to check the email on your
        GitHub account.
      </EmptyState>
    );
  }

  // Details: a new application, a fix, a cohort switch, or starting over after a rejection.
  const editing =
    stage === "details" || mode === "edit" || (stage === "rejected" && fresh);
  const current = a && !(stage === "rejected" && fresh) ? a : null;
  const step: 1 | 2 | 3 = editing
    ? 1
    : stage === "pay" || mode === "pay"
      ? 2
      : 3;

  const chat = a ? (
    <ApplicationChat
      messages={view.messages}
      viewer="applicant"
      otherName="Admissions"
      onSend={send}
    />
  ) : null;
  const proofs = (
    <ProofList proofs={view.proofs} load={(id) => api.myProofImage(id)} />
  );

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {stage === "approved" ? "You're in" : "Join an internship cohort"}
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in your details, pay by UPI, and we&apos;ll confirm your seat,
          usually within a day.
        </p>
      </header>
      {stage === "approved" ? null : <Steps step={step} />}

      {editing ? (
        <DetailsStep
          view={view}
          current={current}
          me={me}
          lockDetails={!!current && !current.actions.includes("edit_details")}
          lockCohort={!!current && !current.actions.includes("change_cohort")}
          onCancel={
            current
              ? () => setMode("status")
              : stage === "rejected"
                ? () => setFresh(false)
                : null
          }
          onSaved={(v) => {
            set(v);
            setMode("status");
            setFresh(false);
          }}
        />
      ) : a && (stage === "pay" || mode === "pay") ? (
        <PayStep
          view={view}
          app={a}
          onBack={
            stage === "pay" ? () => setMode("edit") : () => setMode("status")
          }
          backLabel={stage === "pay" ? "Edit details" : "Back"}
          onSent={(v) => {
            set(v);
            setMode("status");
          }}
        />
      ) : a && stage === "waiting" ? (
        <Waiting app={a} view={view} />
      ) : a && stage === "flagged" ? (
        <Flagged
          app={a}
          onAction={(x) =>
            x === "pay"
              ? setMode("pay")
              : x === "resubmit"
                ? null
                : setMode("edit")
          }
          onError={onError}
          onDone={set}
        />
      ) : a && stage === "approved" ? (
        <Approved view={view} onOpen={() => void reloadMe()} />
      ) : a && stage === "rejected" ? (
        <Rejected app={a} onRestart={() => setFresh(true)} />
      ) : null}

      {editing ? null : proofs}
      {chat}
    </>
  );
}

const STEPS = ["Your details", "Pay", "Confirmation"] as const;

function Steps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Application steps">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className="flex flex-col gap-2"
            data-testid={`apply-step-${n}`}
            data-state={state}
          >
            <span
              className={cn(
                "h-1.5 rounded-full transition-colors duration-500",
                state === "todo" ? "bg-muted" : "bg-primary",
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium sm:text-sm",
                state === "todo" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-[11px] tabular-nums",
                  state === "done"
                    ? "bg-primary text-primary-foreground"
                    : state === "current"
                      ? "border-primary text-primary border"
                      : "bg-muted",
                )}
                aria-hidden
              >
                {state === "done" ? <Check className="size-3" /> : n}
              </span>
              {label}
              {state === "done" ? (
                <span className="sr-only"> (done)</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Step 1: details and cohort ----

function draftFrom(
  a: Application | null,
  me: Me,
  cohorts: Cohort[],
): DetailsDraft {
  if (a) {
    const d = a.details;
    return {
      cohort_id: cohorts.some((c) => c.id === a.cohort_id) ? a.cohort_id : "",
      full_name: d.full_name,
      phone: d.phone,
      date_of_birth: d.date_of_birth,
      college: d.college,
      course: d.course,
      branch: d.branch,
      grad_year: String(d.grad_year),
    };
  }
  return {
    cohort_id: cohorts.length === 1 ? (cohorts[0]?.id ?? "") : "",
    full_name: me.user.name,
    phone: "",
    date_of_birth: "",
    college: "",
    course: "",
    branch: "",
    grad_year: "",
  };
}

function seatsLeft(c: Cohort) {
  return Math.max(c.seats_total - c.seats_used, 0);
}

function DetailsStep({
  view,
  current,
  me,
  lockDetails,
  lockCohort,
  onCancel,
  onSaved,
}: {
  view: ApplicantView;
  current: Application | null;
  me: Me;
  lockDetails: boolean;
  lockCohort: boolean;
  onCancel: (() => void) | null;
  onSaved: (v: ApplicantView) => void;
}) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  // The student's current cohort stays listed even if it closed since they picked it.
  const cohorts =
    current &&
    view.cohort &&
    !view.cohorts.some((c) => c.id === view.cohort?.id)
      ? [view.cohort, ...view.cohorts]
      : view.cohorts;
  // Starting over after a rejection keeps the old details but needs a fresh cohort pick.
  const [d, setD] = useState<DetailsDraft>(() =>
    draftFrom(current ?? view.application, me, cohorts),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      landed(
        () =>
          api.saveApplication(
            {
              cohort_id: d.cohort_id,
              full_name: d.full_name.trim(),
              phone: d.phone.trim(),
              date_of_birth: d.date_of_birth,
              college: d.college.trim(),
              course: d.course.trim(),
              branch: d.branch.trim(),
              grad_year: Number(d.grad_year),
            },
            current?.version ?? null,
          ),
        // Saved if an application now exists that's newer than the one on screen.
        async () => {
          const v = await api.myApplication();
          const a = v.application;
          if (
            !a ||
            !(
              a.status === "draft" ||
              a.status === "submitted" ||
              a.status === "flagged"
            )
          )
            return null;
          return current
            ? a.version > current.version
              ? v
              : null
            : a.id !== view.application?.id
              ? v
              : null;
        },
      ),
    onSuccess: (v) => {
      if (current && current.cohort_id !== d.cohort_id)
        toast.success("Cohort changed");
      onSaved(v);
    },
    onError: (e) => {
      if (
        e instanceof ApiError &&
        e.code === "validation_failed" &&
        Object.keys(e.fields).length
      ) {
        setErrors(e.fields);
        return;
      }
      setFormError(applyErrorMessage(e));
      if (
        e instanceof ApiError &&
        (e.code === "version_conflict" || e.code === "invalid_state")
      )
        void qc.invalidateQueries({ queryKey: KEY });
    },
  });
  const submit = () => {
    const e = detailsErrors(d, new Date());
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length === 0) save.mutate();
  };
  const field = (
    k: keyof DetailsDraft,
    label: string,
    props: {
      placeholder?: string;
      autoComplete?: string;
      inputMode?: "numeric" | "tel";
      type?: string;
      max?: string;
    } = {},
  ) => (
    <Field data-invalid={!!errors[k]}>
      <FieldLabel htmlFor={`${id}-${k}`}>{label}</FieldLabel>
      <Input
        id={`${id}-${k}`}
        value={d[k]}
        onChange={(e) => setD({ ...d, [k]: e.target.value })}
        aria-invalid={!!errors[k]}
        disabled={lockDetails}
        data-testid={`apply-${k}`}
        {...props}
      />
      {errors[k] ? <FieldError>{errors[k]}</FieldError> : null}
    </Field>
  );
  const year = new Date().getFullYear();
  return (
    <Card className="animate-enter">
      <CardHeader>
        <CardTitle>
          {current ? "Update your application" : "Tell us about you"}
        </CardTitle>
        <CardDescription>
          We use this for your enrollment and certificate. Your name appears on
          the certificate exactly as you type it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup>
            {formError ? (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>Couldn&apos;t save</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <FieldSet data-invalid={!!errors.cohort_id}>
              <FieldLegend variant="label">Cohort</FieldLegend>
              <FieldDescription>
                Pick the batch you want to join. The fee is for the full
                internship.
              </FieldDescription>
              <RadioGroup
                value={d.cohort_id}
                onValueChange={(v) => setD({ ...d, cohort_id: v })}
                disabled={lockCohort}
                aria-invalid={!!errors.cohort_id}
                className="sm:grid-cols-2"
              >
                {cohorts.map((c) => {
                  const left = seatsLeft(c);
                  return (
                    <FieldLabel
                      key={c.id}
                      htmlFor={`${id}-c-${c.id}`}
                      className="has-data-[state=checked]:bg-primary/5"
                    >
                      <Field
                        orientation="horizontal"
                        data-testid={`apply-cohort-${c.name}`}
                      >
                        <FieldContent>
                          <FieldTitle>{c.name}</FieldTitle>
                          <FieldDescription>
                            {c.program.days} days · starts {c.start_date}
                            <br />
                            <span className="text-foreground font-semibold">
                              {c.fee_inr ? inr(c.fee_inr) : "No fee"}
                            </span>
                            {left <= 10 ? (
                              <span className="text-destructive">
                                {" "}
                                · {left === 0 ? "full" : `${left} seats left`}
                              </span>
                            ) : null}
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem
                          value={c.id}
                          id={`${id}-c-${c.id}`}
                          disabled={left === 0 && c.id !== current?.cohort_id}
                        />
                      </Field>
                    </FieldLabel>
                  );
                })}
              </RadioGroup>
              {errors.cohort_id ? (
                <FieldError>{errors.cohort_id}</FieldError>
              ) : null}
            </FieldSet>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("full_name", "Full name", { autoComplete: "name" })}
              {field("phone", "Phone (WhatsApp)", {
                autoComplete: "tel",
                inputMode: "tel",
                placeholder: "+91 98765 43210",
                type: "tel",
              })}
              {field("date_of_birth", "Date of birth", {
                type: "date",
                autoComplete: "bday",
                max: isoDate(new Date()),
              })}
              {field("grad_year", "Graduation year", {
                inputMode: "numeric",
                placeholder: String(year + 1),
              })}
              {field("college", "College", {
                placeholder: "ANITS, Visakhapatnam",
                autoComplete: "organization",
              })}
              {field("course", "Course", { placeholder: "B.Tech" })}
              {field("branch", "Branch", { placeholder: "Computer Science" })}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onCancel ? (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={save.isPending}
                data-testid="apply-save"
              >
                {save.isPending ? <Spinner data-icon="inline-start" /> : null}
                {current && current.status !== "draft"
                  ? "Save changes"
                  : "Continue to payment"}
                {current && current.status !== "draft" ? null : (
                  <ArrowRight data-icon="inline-end" aria-hidden />
                )}
              </Button>
            </div>
            <SlowNote busy={save.isPending} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Step 2: pay and upload proof ----

function PayStep({
  view,
  app,
  onBack,
  backLabel,
  onSent,
}: {
  view: ApplicantView;
  app: Application;
  onBack: () => void;
  backLabel: string;
  onSent: (v: ApplicantView) => void;
}) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const pay = view.payment;
  const amount = app.due_inr > 0 ? app.due_inr : app.fee_inr;
  const qr = useQuery({
    queryKey: ["payment-qr", pay.updated_at.toISOString()],
    queryFn: () => api.paymentQR(),
    enabled: pay.has_qr,
    staleTime: Infinity,
  });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const [paid, setPaid] = useState(String(amount));
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("no file");
      const small = await shrinkImage(file);
      if (small.size > PROOF_MAX_BYTES) throw new TooBig();
      const image = await fileToBase64(small);
      const before = view.proofs.length;
      // Sent if the server now has one more screenshot than we had.
      return landed(
        () => api.uploadProof(image, utr.trim(), Number(paid), app.version),
        async () => {
          const v = await api.myApplication();
          return v.proofs.length > before ? v : null;
        },
      );
    },
    onSuccess: (v) => {
      toast.success("Payment sent for confirmation");
      onSent(v);
    },
    onError: (e) => {
      if (e instanceof TooBig) {
        setErrors({
          image:
            "This image is too large even after shrinking. Crop it to the payment details and try again.",
        });
        return;
      }
      if (
        e instanceof ApiError &&
        e.code === "validation_failed" &&
        Object.keys(e.fields).length
      ) {
        setErrors(e.fields);
        return;
      }
      setFormError(applyErrorMessage(e));
      if (
        e instanceof ApiError &&
        (e.code === "version_conflict" || e.code === "invalid_state")
      )
        void qc.invalidateQueries({ queryKey: KEY });
    },
  });
  const pick = (f: File) => {
    // Big phone screenshots are fine: they're shrunk before upload.
    const err = imageFileError(f, PICK_MAX_BYTES);
    setErrors((e) => ({ ...e, image: err ?? "" }));
    if (err) return;
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };
  const submit = () => {
    const e = proofErrors(utr, paid, !!file, agree);
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length === 0) upload.mutate();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pay.upi_id);
      toast.success("UPI ID copied");
    } catch {
      toast.error("Couldn't copy. Select the UPI ID and copy it.");
    }
  };
  const cohortName = view.cohort?.name ?? "your cohort";
  const configured = pay.upi_id !== "" || pay.has_qr;

  return (
    <div className="animate-enter flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-x-2">
            Pay{" "}
            <span className="tabular-nums" data-testid="apply-amount">
              {inr(amount)}
            </span>
            <span className="text-muted-foreground text-sm font-normal">
              {app.due_inr > 0 && app.paid_inr > 0
                ? `remaining of ${inr(app.fee_inr)} · `
                : ""}
              {cohortName}
            </span>
          </CardTitle>
          <CardDescription>
            Scan the QR with any UPI app (GPay, PhonePe, Paytm, BHIM), or pay to
            the UPI ID. Then upload the screenshot below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!configured ? (
            <Alert>
              <CircleAlert aria-hidden />
              <AlertTitle>Payment details coming soon</AlertTitle>
              <AlertDescription>
                We&apos;re setting up payments. Message us below and we&apos;ll
                share how to pay.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid items-center gap-5 sm:grid-cols-[220px_1fr]">
              <div className="mx-auto grid size-[220px] bg-white place-items-center rounded-xl border p-2.5 shadow-sm">
                {!pay.has_qr ? (
                  <span className="text-muted-foreground p-4 text-center text-xs">
                    Pay to the UPI ID shown here.
                  </span>
                ) : qr.isPending ? (
                  <Skeleton className="size-full" />
                ) : qr.isError ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void qr.refetch()}
                  >
                    <RefreshCw data-icon="inline-start" aria-hidden /> Load the
                    QR
                  </Button>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URL from the API
                  <img
                    src={imageSrc(qr.data)}
                    alt={`UPI QR code for ${pay.payee_name || pay.upi_id}`}
                    className="size-full object-contain"
                    data-testid="payment-qr"
                  />
                )}
              </div>
              <dl className="grid gap-3 text-sm">
                {pay.upi_id ? (
                  <div>
                    <dt className="text-muted-foreground text-xs">UPI ID</dt>
                    <dd
                      className="flex items-center gap-1.5 font-mono text-base"
                      data-testid="payment-upi"
                    >
                      {pay.upi_id}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => void copy()}
                        aria-label="Copy UPI ID"
                      >
                        <Copy aria-hidden />
                      </Button>
                    </dd>
                  </div>
                ) : null}
                {pay.payee_name ? (
                  <div>
                    <dt className="text-muted-foreground text-xs">Paying to</dt>
                    <dd className="font-medium">{pay.payee_name}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground text-xs">Amount</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {inr(amount)}
                  </dd>
                </div>
                {pay.note ? (
                  <dd className="text-muted-foreground text-xs">{pay.note}</dd>
                ) : null}
                {pay.upi_id ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="w-fit sm:hidden"
                  >
                    <a
                      href={upiLink(
                        pay.upi_id,
                        pay.payee_name,
                        amount,
                        cohortName,
                      )}
                    >
                      <Smartphone data-icon="inline-start" aria-hidden /> Open
                      UPI app
                    </a>
                  </Button>
                ) : null}
              </dl>
            </div>
          )}
          <Alert variant="destructive" data-testid="no-refund">
            <ShieldAlert aria-hidden />
            <AlertTitle>No refunds</AlertTitle>
            <AlertDescription>
              {pay.no_refund_policy} Check the cohort and amount before you pay.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload your payment screenshot</CardTitle>
          <CardDescription>
            The screenshot should show the amount, the date and the UPI
            transaction ID (UTR / reference number).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <FieldGroup>
              {formError ? (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden />
                  <AlertTitle>Couldn&apos;t send it</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={!!errors.image}>
                <FieldLabel>Screenshot</FieldLabel>
                <FileDrop
                  accept="image/png,image/jpeg,image/webp"
                  onFile={pick}
                  label="Choose image"
                  hint="A PNG, JPG or WebP screenshot"
                />
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview of the picked file
                  <img
                    src={preview}
                    alt="Your screenshot"
                    className="max-h-64 w-fit rounded-lg border object-contain"
                    data-testid="proof-preview"
                  />
                ) : null}
                {errors.image ? <FieldError>{errors.image}</FieldError> : null}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.utr}>
                  <FieldLabel htmlFor={`${id}-utr`}>
                    UPI transaction ID (UTR)
                  </FieldLabel>
                  <Input
                    id={`${id}-utr`}
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="12-digit number"
                    aria-invalid={!!errors.utr}
                    className="font-mono"
                    data-testid="apply-utr"
                  />
                  {errors.utr ? <FieldError>{errors.utr}</FieldError> : null}
                </Field>
                <Field data-invalid={!!errors.amount_inr}>
                  <FieldLabel htmlFor={`${id}-amt`}>
                    Amount you paid (₹)
                  </FieldLabel>
                  <Input
                    id={`${id}-amt`}
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                    inputMode="numeric"
                    aria-invalid={!!errors.amount_inr}
                    data-testid="apply-paid"
                  />
                  {errors.amount_inr ? (
                    <FieldError>{errors.amount_inr}</FieldError>
                  ) : null}
                </Field>
              </div>
              <Field orientation="horizontal" data-invalid={!!errors.agree}>
                <Checkbox
                  id={`${id}-agree`}
                  checked={agree}
                  onCheckedChange={(v) => setAgree(v === true)}
                  aria-invalid={!!errors.agree}
                  data-testid="apply-agree"
                />
                <FieldContent>
                  <FieldLabel htmlFor={`${id}-agree`} className="font-normal">
                    I understand that fees are non-refundable under any
                    circumstances.
                  </FieldLabel>
                  {errors.agree ? (
                    <FieldError>{errors.agree}</FieldError>
                  ) : null}
                </FieldContent>
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" onClick={onBack}>
                  <ArrowLeft data-icon="inline-start" aria-hidden /> {backLabel}
                </Button>
                <Button
                  type="submit"
                  disabled={upload.isPending}
                  data-testid="apply-send-proof"
                >
                  {upload.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Send data-icon="inline-start" aria-hidden />
                  )}
                  Send for confirmation
                </Button>
              </div>
              <SlowNote busy={upload.isPending} />
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Step 3: status ----

function StatusCard({
  icon: Icon,
  tone,
  title,
  children,
  testId,
}: {
  icon: typeof Hourglass;
  tone: "wait" | "warn" | "good" | "bad";
  title: string;
  children: ReactNode;
  testId: string;
}) {
  const ring = {
    wait: "bg-primary/10 text-primary",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    bad: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <Card className="animate-enter" data-testid={testId}>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full",
            ring,
          )}
        >
          <Icon
            className={cn(
              "size-6",
              tone === "wait" && "motion-safe:animate-pulse",
            )}
            aria-hidden
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

function Summary({ app, view }: { app: Application; view: ApplicantView }) {
  return (
    <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs">Cohort</dt>
        <dd className="text-foreground">{view.cohort?.name ?? "Not set"}</dd>
      </div>
      <div>
        <dt className="text-xs">Fee</dt>
        <dd className="text-foreground tabular-nums">{inr(app.fee_inr)}</dd>
      </div>
      <div>
        <dt className="text-xs">Confirmed</dt>
        <dd className="text-foreground tabular-nums">{inr(app.paid_inr)}</dd>
      </div>
      <div>
        <dt className="text-xs">Starts</dt>
        <dd className="text-foreground tabular-nums">
          {view.cohort?.start_date ?? "Not set"}
        </dd>
      </div>
    </dl>
  );
}

function Waiting({ app, view }: { app: Application; view: ApplicantView }) {
  return (
    <StatusCard
      icon={Hourglass}
      tone="wait"
      title="Payment received, awaiting confirmation"
      testId="apply-waiting"
    >
      <p className="text-sm">
        Thanks! We&apos;re matching your screenshot with our account. This
        usually takes less than a day; this page updates on its own. If
        something doesn&apos;t line up, we&apos;ll tell you here what to do.
      </p>
      <Summary app={app} view={view} />
    </StatusCard>
  );
}

const ACTION_LABEL: Record<ApplicantAction, string> = {
  pay: "Upload a payment",
  change_cohort: "Change cohort",
  edit_details: "Fix my details",
  resubmit: "Send back for review",
};

function Flagged({
  app,
  onAction,
  onError,
  onDone,
}: {
  app: Application;
  onAction: (a: ApplicantAction) => void;
  onError: (e: unknown) => void;
  onDone: (v: ApplicantView) => void;
}) {
  const { api } = useSession();
  const resubmit = useMutation({
    mutationFn: () =>
      landed(
        () => api.resubmitApplication(app.version),
        async () => {
          const v = await api.myApplication();
          return v.application && v.application.status !== "flagged" ? v : null;
        },
      ),
    onSuccess: (v) => {
      toast.success("Sent back for review");
      onDone(v);
    },
    onError,
  });
  // When pay and change_cohort are both open, both are real choices; pay comes first only for payment issues.
  const actions = app.actions;
  const label = (x: ApplicantAction) =>
    x === "pay" && app.due_inr > 0 && app.paid_inr > 0
      ? `Pay the remaining ${inr(app.due_inr)}`
      : ACTION_LABEL[x];
  return (
    <StatusCard
      icon={CircleAlert}
      tone="warn"
      title={flagHeadline(app)}
      testId="apply-flagged"
    >
      {app.flag_note ? (
        <blockquote
          className="border-l-2 pl-3 text-sm whitespace-pre-wrap"
          data-testid="apply-flag-note"
        >
          {app.flag_note}
        </blockquote>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {app.flag === "cohort_mismatch" || app.flag === "cohort_full"
          ? "Switch to another cohort (what you've paid carries over) or pay the difference."
          : "Pick what fits below. Questions? Ask in the chat."}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {actions.map((x, i) =>
          x === "resubmit" ? (
            <Button
              key={x}
              variant={i === 0 ? "default" : "outline"}
              disabled={resubmit.isPending}
              onClick={() => resubmit.mutate()}
              data-testid="apply-action-resubmit"
            >
              {resubmit.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Send data-icon="inline-start" aria-hidden />
              )}
              {label(x)}
            </Button>
          ) : (
            <Button
              key={x}
              variant={i === 0 ? "default" : "outline"}
              onClick={() => onAction(x)}
              data-testid={`apply-action-${x}`}
            >
              {label(x)}
            </Button>
          ),
        )}
      </div>
    </StatusCard>
  );
}

function Approved({
  view,
  onOpen,
}: {
  view: ApplicantView;
  onOpen: () => void;
}) {
  return (
    <StatusCard
      icon={PartyPopper}
      tone="good"
      title="Payment confirmed. Welcome aboard!"
      testId="apply-approved"
    >
      <p className="text-sm">
        You&apos;re enrolled in{" "}
        <strong>{view.cohort?.name ?? "your cohort"}</strong>
        {view.cohort ? <> starting {view.cohort.start_date}</> : null}. Your
        team lead is waiting in your workspace.
      </p>
      <Button
        className="w-fit"
        onClick={onOpen}
        data-testid="apply-open-workspace"
      >
        <BadgeCheck data-icon="inline-start" aria-hidden /> Open my workspace
      </Button>
    </StatusCard>
  );
}

function Rejected({
  app,
  onRestart,
}: {
  app: Application;
  onRestart: () => void;
}) {
  return (
    <StatusCard
      icon={XCircle}
      tone="bad"
      title="This application was closed"
      testId="apply-rejected"
    >
      {app.flag_note ? (
        <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
          {app.flag_note}
        </blockquote>
      ) : (
        <p className="text-sm">The reason is in the chat below.</p>
      )}
      <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <CalendarClock className="size-4" aria-hidden /> Fees are non-refundable
        under any circumstances.
      </p>
      <Button
        variant="outline"
        className="w-fit"
        onClick={onRestart}
        data-testid="apply-restart"
      >
        Start a new application
      </Button>
    </StatusCard>
  );
}
