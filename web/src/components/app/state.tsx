import { CloudOff, RefreshCw, type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LoadingPanel } from "./loading";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Empty className="animate-enter">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={2}>
          {title}
        </EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Couldn't load this"
      action={
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" aria-hidden />
          Try again
        </Button>
      }
    >
      {message}
    </EmptyState>
  );
}

/** Shimmering rows that ease in; three or more rows also get a rotating industry one-liner. */
export function ListSkeleton({ rows = 4, className = "h-20", quip }: { rows?: number; className?: string; quip?: boolean }) {
  return <LoadingPanel rows={rows} className={className} quip={quip ?? rows >= 3} />;
}
