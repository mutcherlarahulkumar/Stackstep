import { type Metadata } from "next";
import { Suspense } from "react";

import { FullPageLoader } from "@/components/app/guard";
import { PullRequestPage } from "@/components/review-lab/pr-page";

export const metadata: Metadata = { title: "Review a pull request" };

type Params = Promise<{ key: string }>;

export default function ReviewLabExercisePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Route params={params} />
    </Suspense>
  );
}

async function Route({ params }: { params: Params }) {
  const { key } = await params;
  return <PullRequestPage exerciseKey={decodeURIComponent(key)} />;
}
