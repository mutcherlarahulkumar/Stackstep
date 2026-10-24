"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, GitPullRequest, MessagesSquare, Sparkles, SquareKanban, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { messageFor } from "@/lib/api/errors";
import { GUIDE, type GuideIcon } from "@/lib/onboarding";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const ICON: Record<GuideIcon, LucideIcon> = {
  board: SquareKanban,
  chat: MessagesSquare,
  handin: GitPullRequest,
  points: Sparkles,
};

/** Four short steps on a student's first visit. Finishing or skipping is remembered on the server. */
export function OnboardingDialog() {
  const { api, setAccount } = useSession();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const done = useMutation({
    mutationFn: () => api.finishOnboarding(),
    onSuccess: setAccount,
    onError: (e) => toast.error(messageFor(e)),
  });
  const finish = () => {
    setOpen(false);
    done.mutate();
  };
  const s = GUIDE[step] ?? GUIDE[0];
  if (!s) return null;
  const Icon = ICON[s.icon];
  const last = step === GUIDE.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : finish())}>
      <DialogContent className="sm:max-w-md" data-testid="onboarding">
        <div key={step} className="animate-enter flex flex-col gap-4">
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl">
            <Icon className="size-6" aria-hidden />
          </span>
          <DialogHeader>
            <p className="text-muted-foreground text-xs font-medium tabular-nums" aria-live="polite">
              Step {step + 1} of {GUIDE.length}
            </p>
            <DialogTitle>{s.title}</DialogTitle>
            <DialogDescription className="leading-relaxed">{s.body}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {GUIDE.map((g, i) => (
            <span key={g.icon} className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "bg-primary w-6" : "bg-muted-foreground/30 w-1.5")} />
          ))}
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={finish} data-testid="onboarding-skip">
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button variant="outline" size="icon" onClick={() => setStep(step - 1)} aria-label="Previous step">
                <ArrowLeft aria-hidden />
              </Button>
            ) : null}
            {last ? (
              <Button onClick={finish} disabled={done.isPending} data-testid="onboarding-done">
                {done.isPending ? <Spinner data-icon="inline-start" /> : null}
                Let&apos;s go
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} data-testid="onboarding-next">
                Next <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
