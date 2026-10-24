import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** One number with a label. Pass onClick to make the whole tile a button. */
export function StatTile({
  icon: Icon,
  iconClassName,
  label,
  value,
  detail,
  onClick,
  children,
  testId,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
  testId?: string;
}) {
  const body = (
    <>
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className={cn("size-3.5", iconClassName)} aria-hidden /> {label}
      </span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {detail ? <span className="text-muted-foreground text-xs">{detail}</span> : null}
      {children}
    </>
  );
  const cls = "bg-card flex min-w-0 flex-col gap-1 rounded-xl border p-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "hover:bg-muted/50 focus-visible:ring-ring transition-colors outline-none focus-visible:ring-2")} data-testid={testId}>
      {body}
    </button>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}
