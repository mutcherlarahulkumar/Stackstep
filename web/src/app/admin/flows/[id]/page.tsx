import { type Metadata } from "next";
import { Suspense } from "react";

import { FlowBuilderScreen } from "@/components/admin/flow-builder";
import { FullPageLoader } from "@/components/app/guard";

export const metadata: Metadata = { title: "Flow builder" };

type Params = Promise<{ id: string }>;

export default function FlowPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <FlowRoute params={params} />
    </Suspense>
  );
}

async function FlowRoute({ params }: { params: Params }) {
  const { id } = await params;
  return <FlowBuilderScreen id={id} />;
}
