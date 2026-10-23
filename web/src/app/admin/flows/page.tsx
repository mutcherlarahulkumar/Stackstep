import { type Metadata } from "next";

import { FlowsScreen } from "@/components/admin/flows";

export const metadata: Metadata = { title: "Flows" };

export default function FlowsPage() {
  return <FlowsScreen />;
}
