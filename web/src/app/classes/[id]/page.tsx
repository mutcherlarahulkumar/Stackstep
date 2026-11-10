import { type Metadata } from "next";
import { Suspense } from "react";

import { FullPageLoader } from "@/components/app/guard";
import { ClassRoomScreen } from "@/components/classroom/room-screen";

export const metadata: Metadata = { title: "Live class", robots: { index: false } };

type Params = Promise<{ id: string }>;

export default function ClassPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Route params={params} />
    </Suspense>
  );
}

async function Route({ params }: { params: Params }) {
  const { id } = await params;
  return <ClassRoomScreen id={decodeURIComponent(id)} />;
}
