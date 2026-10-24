import { type Metadata } from "next";

import { ReportScreen } from "@/components/admin/report";

export const metadata: Metadata = { title: "Weekly report" };

export default function ReportPage() {
  return <ReportScreen />;
}
