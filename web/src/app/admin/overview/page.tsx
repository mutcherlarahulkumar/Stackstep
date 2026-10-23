import { type Metadata } from "next";

import { OverviewScreen } from "@/components/admin/overview";

export const metadata: Metadata = { title: "Placement overview" };

export default function OverviewPage() {
  return <OverviewScreen />;
}
