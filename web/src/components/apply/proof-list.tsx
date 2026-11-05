"use client";

import { useQuery } from "@tanstack/react-query";
import { CopyX, Eye, ReceiptIndianRupee } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { type ImageData, type PaymentProof } from "@/lib/api/schemas";
import { applyErrorMessage, imageSrc, inr } from "@/lib/apply";
import { dateTimeLabel } from "@/lib/format";

/** Every screenshot sent for one application, newest last, each viewable full size. */
export function ProofList({ proofs, load, staff }: { proofs: PaymentProof[]; load: (id: string) => Promise<ImageData>; staff?: boolean }) {
  const [open, setOpen] = useState<PaymentProof | null>(null);
  if (proofs.length === 0) return null;
  return (
    <section aria-labelledby="proofs-h" className="flex flex-col gap-2">
      <h2 id="proofs-h" className="text-sm font-medium">
        {staff ? "Payment screenshots" : "Payments you sent"}
      </h2>
      <ul className="divide-y rounded-xl border">
        {proofs.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid="proof-row">
            <ReceiptIndianRupee className="text-muted-foreground size-4" aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium tabular-nums">{inr(p.amount_inr)}</span>
              <span className="text-muted-foreground text-xs">
                UTR <span className="font-mono">{p.utr}</span> · {dateTimeLabel(p.uploaded_at)}
              </span>
            </div>
            {staff && p.duplicate ? (
              <Badge variant="destructive" data-testid="proof-duplicate">
                <CopyX aria-hidden /> Used on another application
              </Badge>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setOpen(p)}>
              <Eye data-icon="inline-start" aria-hidden /> View
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => (o ? null : setOpen(null))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment of {open ? inr(open.amount_inr) : ""}</DialogTitle>
            <DialogDescription>UTR {open?.utr}</DialogDescription>
          </DialogHeader>
          {open ? <ProofImage id={open.id} load={load} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ProofImage({ id, load }: { id: string; load: (id: string) => Promise<ImageData> }) {
  const q = useQuery({ queryKey: ["proof-image", id], queryFn: () => load(id), staleTime: Infinity });
  if (q.isPending) return <Skeleton className="h-96 w-full" />;
  if (q.isError) return <p className="text-destructive text-sm">{applyErrorMessage(q.error)}</p>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URL from the API, not a static asset
    <img src={imageSrc(q.data)} alt="Payment screenshot" className="max-h-[70vh] w-full rounded-lg border object-contain" data-testid="proof-image" />
  );
}
