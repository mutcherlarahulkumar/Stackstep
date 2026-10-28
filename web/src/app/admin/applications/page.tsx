import { type Metadata } from "next";

import { ApplicationsScreen } from "@/components/admin/applications";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return <ApplicationsScreen />;
}
