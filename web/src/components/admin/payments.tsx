"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Lock, QrCode } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/errors";
import { type Me, type PaymentInfo } from "@/lib/api/schemas";
import { applyErrorMessage, fileToBase64, imageFileError, imageSrc, QR_MAX_BYTES } from "@/lib/apply";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

import { FileDrop } from "../app/file-drop";
import { InfoNote } from "../app/info-note";
import { PAGE, PageHeader } from "../app/page-header";
import { EmptyState, ErrorState, ListSkeleton } from "../app/state";
import { AdminShell } from "./admin-shell";
import { splitError } from "./form-errors";

export function PaymentsScreen() {
  return <AdminShell section="payments" phone="gate">{(me) => <Payments me={me} />}</AdminShell>;
}

function Payments({ me }: { me: Me }) {
  const { api } = useSession();
  const admin = me.user.role === "admin";
  const q = useQuery({ queryKey: ["payment-settings"], queryFn: () => api.paymentSettings(), enabled: admin });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn(PAGE, "gap-6")}>
        <PageHeader title="Payments" description="Where students send their fee." />
        <InfoNote id="payments" title="How payments work">
          Students who apply see this UPI ID and QR code on the payment step, pay the cohort&apos;s fee from any UPI app and upload a screenshot.
          You then match it with your bank or UPI app under Applications. Fees per cohort are set under Setup, then Cohorts. Stackstep never
          touches the money.
        </InfoNote>
        {!admin ? (
          <EmptyState icon={Lock} title="Platform admins only">
            Payment details and fees are set by the Stackstep team. You can still see and decide on your college&apos;s applications.
          </EmptyState>
        ) : q.isPending ? (
          <ListSkeleton rows={2} className="h-48" />
        ) : q.isError ? (
          <ErrorState message={applyErrorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <UpiForm key={q.data.updated_at.toISOString()} info={q.data} />
              <QrCard info={q.data} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UpiForm({ info }: { info: PaymentInfo }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const id = useId();
  const [upi, setUpi] = useState(info.upi_id);
  const [payee, setPayee] = useState(info.payee_name);
  const [note, setNote] = useState(info.note);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.savePaymentSettings(upi.trim(), payee.trim(), note.trim()),
    onSuccess: (v) => {
      qc.setQueryData(["payment-settings"], v);
      toast.success("Payment details saved");
    },
    onError: (e) => {
      const { fields, form } = splitError(e);
      setErrors(fields);
      setFormError(form);
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>UPI details</CardTitle>
        <CardDescription>Shown to students next to the QR on the payment step.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            setFormError(null);
            save.mutate();
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
            <Field data-invalid={!!errors.upi_id}>
              <FieldLabel htmlFor={`${id}-upi`}>UPI ID</FieldLabel>
              <Input id={`${id}-upi`} value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okaxis" className="font-mono" aria-invalid={!!errors.upi_id} data-testid="payments-upi" />
              {errors.upi_id ? <FieldError>{errors.upi_id}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.payee_name}>
              <FieldLabel htmlFor={`${id}-payee`}>Payee name</FieldLabel>
              <Input id={`${id}-payee`} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="As your bank shows it" aria-invalid={!!errors.payee_name} />
              {errors.payee_name ? <FieldError>{errors.payee_name}</FieldError> : <FieldDescription>Students check this matches before paying.</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.note}>
              <FieldLabel htmlFor={`${id}-note`}>Note (optional)</FieldLabel>
              <Input id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pay the exact amount in one payment." aria-invalid={!!errors.note} />
              {errors.note ? <FieldError>{errors.note}</FieldError> : null}
            </Field>
            <Button type="submit" className="w-fit" disabled={save.isPending} data-testid="payments-save">
              {save.isPending ? <Spinner data-icon="inline-start" /> : null} Save
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function QrCard({ info }: { info: PaymentInfo }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const qr = useQuery({ queryKey: ["payment-qr", info.updated_at.toISOString()], queryFn: () => api.paymentQR(), enabled: info.has_qr, staleTime: Infinity });
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async (f: File) => api.savePaymentQR(await fileToBase64(f)),
    onSuccess: (v) => {
      qc.setQueryData(["payment-settings"], v);
      toast.success("QR updated. Students see it right away");
    },
    onError: (e) => setError(e instanceof ApiError && e.code === "validation_failed" ? (Object.values(e.fields)[0] ?? applyErrorMessage(e)) : applyErrorMessage(e)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment QR</CardTitle>
        <CardDescription>The QR from your UPI or bank app.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="mx-auto grid size-56 place-items-center rounded-xl border bg-white p-2">
          {!info.has_qr ? (
            <span className="text-muted-foreground flex flex-col items-center gap-2 text-center text-xs">
              <QrCode className="size-8" aria-hidden /> No QR yet
            </span>
          ) : qr.isPending ? (
            <Skeleton className="size-full" />
          ) : qr.isError ? (
            <span className="text-destructive text-xs">{applyErrorMessage(qr.error)}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a data: URL from the API
            <img src={imageSrc(qr.data)} alt="Current payment QR" className="size-full object-contain" data-testid="payments-qr" />
          )}
        </div>
        <FileDrop
          accept="image/png,image/jpeg,image/webp"
          label={upload.isPending ? "Uploading…" : info.has_qr ? "Replace" : "Upload"}
          hint="PNG, JPG or WebP, up to 2 MB"
          onFile={(f) => {
            const err = imageFileError(f, QR_MAX_BYTES);
            setError(err);
            if (!err) upload.mutate(f);
          }}
        />
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
