import { BookOpen, Binary, Bug, GitBranch, ListChecks, MessageSquareCode, Sparkles, Users, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { type TaskStatus, type TaskType } from "@/lib/api/schemas";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/board";
import { cn } from "@/lib/utils";

export const TYPE_ICON: Record<TaskType, LucideIcon> = {
  feature: Sparkles,
  bug_fix: Bug,
  dsa: Binary,
  doc_reading: BookOpen,
  quiz: ListChecks,
  git_chore: GitBranch,
  code_review: MessageSquareCode,
  standup: Users,
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: "bg-secondary text-secondary-foreground",
  in_progress: "bg-primary/12 text-primary",
  in_review: "bg-warning/14 text-warning",
  changes_requested: "bg-destructive/12 text-destructive",
  done: "bg-success/14 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLE[status], className)} data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: TaskType }) {
  const Icon = TYPE_ICON[type];
  return (
    <Badge variant="outline">
      <Icon data-icon="inline-start" aria-hidden />
      {TYPE_LABEL[type]}
    </Badge>
  );
}
