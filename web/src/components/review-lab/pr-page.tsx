"use client";

import { useSearchParams } from "next/navigation";

import { PullRequestScreen } from "./pr-screen";

/** Reads ?task=<id>, so the review counts as that task's hand-in. */
export function PullRequestPage({ exerciseKey }: { exerciseKey: string }) {
  const task = useSearchParams().get("task");
  return <PullRequestScreen exerciseKey={exerciseKey} taskId={task} />;
}
