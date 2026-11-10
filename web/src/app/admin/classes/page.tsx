import { type Metadata } from "next";

import { ClassesScreen } from "@/components/admin/classes";

export const metadata: Metadata = { title: "Live classes" };

export default function ClassesPage() {
  return <ClassesScreen />;
}
