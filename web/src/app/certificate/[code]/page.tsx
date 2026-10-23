import { type Metadata } from "next";
import { Suspense } from "react";

import { CertificateScreen } from "@/components/certificate/certificate";
import { FullPageLoader } from "@/components/app/guard";

export const metadata: Metadata = { title: "Certificate", robots: { index: false } };

type Params = Promise<{ code: string }>;

export default function CertificatePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Route params={params} />
    </Suspense>
  );
}

async function Route({ params }: { params: Params }) {
  const { code } = await params;
  return <CertificateScreen code={decodeURIComponent(code)} />;
}
