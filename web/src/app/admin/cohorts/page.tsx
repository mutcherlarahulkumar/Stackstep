import { type Metadata } from "next";

import { CohortsScreen } from "@/components/admin/cohorts";

export const metadata: Metadata = { title: "Cohorts" };

export default function CohortsPage() {
  return <CohortsScreen />;
}
