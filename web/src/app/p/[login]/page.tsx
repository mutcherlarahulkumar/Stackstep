import { type Metadata } from "next";
import { Suspense } from "react";

import { FullPageLoader } from "@/components/app/guard";
import { PortfolioScreen } from "@/components/portfolio/portfolio-screen";

type Params = Promise<{ login: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { login } = await params;
  return { title: `@${decodeURIComponent(login)} · Portfolio` };
}

export default function PortfolioPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Route params={params} />
    </Suspense>
  );
}

async function Route({ params }: { params: Params }) {
  const { login } = await params;
  return <PortfolioScreen login={decodeURIComponent(login)} />;
}
