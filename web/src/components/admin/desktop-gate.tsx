"use client";

import { Copy, Monitor, Send } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown instead of the admin console below 1024 px. Task allocation stays one tap away. */
export function DesktopGate() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm" data-testid="desktop-gate">
        <CardHeader className="gap-3">
          <span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-lg">
            <Monitor className="size-5" aria-hidden />
          </span>
          <CardTitle className="text-lg">The admin console is built for a bigger screen</CardTitle>
          <CardDescription>
            Reviews, cohorts and reports need room to work well. Open Stackstep on a computer for the full console. On this device you can still
            assign tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="h-11 w-full">
            <Link href="/admin/assign">
              <Send data-icon="inline-start" aria-hidden /> Assign a task
            </Link>
          </Button>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${window.location.origin}/admin`)
                .then(() => toast.success("Link copied — open it on your computer"))
                .catch(() => toast.error("Couldn't copy. The address is " + window.location.origin + "/admin"));
            }}
          >
            <Copy data-icon="inline-start" aria-hidden /> Copy desktop link
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
