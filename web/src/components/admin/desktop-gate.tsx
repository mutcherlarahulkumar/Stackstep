"use client";

import { Copy, Inbox, Monitor, Send } from "lucide-react";
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
            Flows, the task library, personas and reviews need room to work well. Open Stackstep on a computer for the full console. On this
            device you can assign tasks and reply to students.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild size="lg" className="h-11 w-full">
            <Link href="/admin/assign">
              <Send data-icon="inline-start" aria-hidden /> Assign a task
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 w-full">
            <Link href="/admin/inbox">
              <Inbox data-icon="inline-start" aria-hidden /> Open inbox
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
                .then(() => toast.success("Link copied. Open it on your computer"))
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
