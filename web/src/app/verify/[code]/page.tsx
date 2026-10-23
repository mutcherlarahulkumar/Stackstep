import { type Metadata } from "next";
import { Suspense } from "react";

import { VerifyScreen } from "@/components/certificate/certificate";
import { FullPageLoader } from "@/components/app/guard";

export const metadata: Metadata = { title: "Certificate check", robots: { index: false } };

type Params = Promise<{ code: string }>;

export default function VerifyPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Route params={params} />
    </Suspense>
  );
}

async function Route({ params }: { params: Params }) {
  const { code } = await params;
  return <VerifyScreen code={decodeURIComponent(code)} />;
}
