"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Copy, FileBadge, FileDown, ImageDown, Printer, SearchX, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, messageFor } from "@/lib/api/errors";
import { type Certificate } from "@/lib/api/schemas";
import { certificatePath, dateOnlyLabel, formatCode, isCode, normalizeCode, programLabel, verifyPath } from "@/lib/certificate";
import { dateTimeLabel } from "@/lib/format";
import { useSession } from "@/lib/session";

import { Wordmark } from "../app/brand";
import { EmptyState, ErrorState } from "../app/state";
import { ART_HEIGHT, ART_WIDTH, CertificateArt } from "./certificate-art";
import { ThemeToggle } from "../app/theme-toggle";

const isNotFound = (e: unknown) => e instanceof ApiError && e.code === "not_found";

/** Looks a code up without signing in. Unknown codes are not retried. */
export function useVerifiedCertificate(code: string) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["verify-certificate", code],
    queryFn: () => api.verifyCertificate(code),
    retry: (n, e) => !isNotFound(e) && n < 2,
    staleTime: 60_000,
  });
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col print:block print:min-h-0">
      <header className="flex h-14 items-center gap-3 border-b px-4 sm:px-6 print:hidden">
        <Link href="/" className="rounded-md" aria-label="Stackstep home">
          <Wordmark />
        </Link>
        <span className="text-muted-foreground hidden text-sm sm:inline">Certificate check</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 py-8 sm:py-12 print:p-0">
        {children}
      </main>
    </div>
  );
}

/** /verify — type a code from a CV or a printed certificate. */
export function VerifyLookupScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <PublicShell>
      <Card className="h-fit w-full max-w-md">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            Check a certificate
          </CardTitle>
          <CardDescription>Every Stackstep certificate has a 12-character code. Enter it to see who earned it and whether it still stands.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="verify-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!isCode(code)) {
                setError("Codes are 12 letters and digits, like ABCD-EFGH-JK23.");
                return;
              }
              setError(null);
              router.push(verifyPath(normalizeCode(code)));
            }}
          >
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="certificate-code">Certificate code</FieldLabel>
              <Input
                id="certificate-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCD-EFGH-JK23"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono uppercase"
                aria-invalid={!!error}
              />
              {error ? <FieldError>{error}</FieldError> : <FieldDescription>Dashes and spaces are optional.</FieldDescription>}
            </Field>
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="verify-form" className="w-full">
            Check
          </Button>
        </CardFooter>
      </Card>
    </PublicShell>
  );
}

/** /verify/{code} — the public answer: valid, revoked or unknown. */
export function VerifyScreen({ code }: { code: string }) {
  const q = useVerifiedCertificate(code);
  return (
    <PublicShell>
      <div className="flex w-full max-w-xl flex-col gap-4">
        {q.isPending ? (
          <Card role="status" aria-label="Checking certificate">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ) : q.isError ? (
          isNotFound(q.error) ? (
            <EmptyState
              icon={SearchX}
              title="No certificate with this code"
              action={
                <Button asChild variant="outline">
                  <Link href="/verify">Try another code</Link>
                </Button>
              }
            >
              We couldn&apos;t find <span className="font-mono">{formatCode(code)}</span>. Check it against the certificate. Codes never use 0, 1, I, L or O.
            </EmptyState>
          ) : (
            <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
          )
        ) : (
          <VerifiedCard cert={q.data} />
        )}
      </div>
    </PublicShell>
  );
}

function VerifiedCard({ cert }: { cert: Certificate }) {
  const revoked = cert.status === "revoked";
  const copy = () => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy. Copy the address bar instead."));
  };
  return (
    <>
      {revoked ? (
        <Alert variant="destructive" data-testid="certificate-revoked">
          <ShieldAlert aria-hidden />
          <AlertTitle>This certificate was revoked</AlertTitle>
          <AlertDescription>
            {cert.revoked_at ? `On ${dateTimeLabel(cert.revoked_at)}. ` : null}
            The reason given was {cert.revoke_reason ?? "not recorded"}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert data-testid="certificate-valid" className="border-success/40">
          <BadgeCheck className="text-success" aria-hidden />
          <AlertTitle>Verified by Stackstep</AlertTitle>
          <AlertDescription>This certificate is genuine and has not been revoked.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={1} className="text-xl">
            {cert.student_name}
          </CardTitle>
          <CardDescription>
            completed the {programLabel(cert)}
            {cert.flow_name ? ` (${cert.flow_name})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="GitHub">
              <a href={`https://github.com/${encodeURIComponent(cert.github_login)}`} className="text-primary underline-offset-4 hover:underline" rel="noreferrer noopener" target="_blank">
                @{cert.github_login}
              </a>
            </Fact>
            <Fact label="Dates">
              {dateOnlyLabel(cert.start_date)} – {dateOnlyLabel(cert.end_date)}
            </Fact>
            <Fact label="Tasks finished">
              {cert.tasks_done} of {cert.tasks_total}
            </Fact>
            <Fact label="Points">{cert.points}</Fact>
            <Fact label="Issued">{dateTimeLabel(cert.issued_at)}</Fact>
            <Fact label="Code">
              <span className="font-mono">{formatCode(cert.code)}</span>
            </Fact>
          </dl>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {revoked ? null : (
            <Button asChild>
              <Link href={certificatePath(cert.code)}>
                <FileBadge data-icon="inline-start" aria-hidden /> View certificate
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={copy}>
            <Copy data-icon="inline-start" aria-hidden /> Copy link
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** /certificate/{code} — the designed certificate: print, or download as PNG or SVG. */
export function CertificateScreen({ code }: { code: string }) {
  const q = useVerifiedCertificate(code);
  return (
    <PublicShell>
      {q.isPending ? (
        <Skeleton role="status" aria-label="Loading certificate" className="aspect-[1.414] w-full max-w-4xl" />
      ) : q.isError ? (
        isNotFound(q.error) ? (
          <EmptyState
            icon={SearchX}
            title="No certificate with this code"
            action={
              <Button asChild variant="outline">
                <Link href="/verify">Check a code</Link>
              </Button>
            }
          >
            The link may be mistyped.
          </EmptyState>
        ) : (
          <ErrorState message={messageFor(q.error)} onRetry={() => void q.refetch()} />
        )
      ) : (
        <div className="flex w-full max-w-5xl flex-col gap-4 print:max-w-none">
          <CertificateDocument cert={q.data} />
        </div>
      )}
    </PublicShell>
  );
}

function CertificateDocument({ cert }: { cert: Certificate }) {
  const art = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const revoked = cert.status === "revoked";
  const name = `stackstep-certificate-${formatCode(cert.code)}`;

  const svgText = () => {
    const el = art.current;
    return el ? new XMLSerializer().serializeToString(el) : null;
  };
  const save = (blob: Blob, file: string) => {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  const downloadSvg = () => {
    const text = svgText();
    if (!text) return;
    save(new Blob([text], { type: "image/svg+xml" }), `${name}.svg`);
  };
  const downloadPng = async () => {
    const text = svgText();
    if (!text) return;
    setBusy(true);
    try {
      const png = await svgToPng(text, ART_WIDTH * 2, ART_HEIGHT * 2);
      save(png, `${name}.png`);
    } catch {
      toast.error("Couldn't make the image. Try Download SVG, or Print and save as PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button variant="ghost" asChild>
          <Link href={verifyPath(cert.code)}>Verification page</Link>
        </Button>
        {revoked ? null : (
          <>
          <Button variant="outline" onClick={() => void downloadPng()} disabled={busy} data-testid="download-png">
            {busy ? <Spinner data-icon="inline-start" /> : <ImageDown data-icon="inline-start" aria-hidden />} Download PNG
          </Button>
          <Button variant="outline" onClick={downloadSvg} data-testid="download-svg">
            <FileDown data-icon="inline-start" aria-hidden /> Download SVG
          </Button>
          <Button onClick={() => window.print()}>
            <Printer data-icon="inline-start" aria-hidden /> Print or save PDF
          </Button>
          </>
        )}
      </div>
      <article
        data-testid="certificate-document"
        aria-label={`Certificate for ${cert.student_name}`}
        className="overflow-hidden rounded-xl border shadow-sm print:rounded-none print:border-0 print:shadow-none"
      >
        <CertificateArt ref={art} cert={cert} origin={origin} />
      </article>
      {/* Landscape, no margins: the artwork is drawn to A4. */}
      <style>{"@media print { @page { size: A4 landscape; margin: 0; } }"}</style>
    </div>
  );
}

/** Draws the SVG onto a canvas and returns a PNG. System fonts only, so nothing is missing. */
function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png");
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
