import { type Metadata } from "next";

import { CollegesScreen } from "@/components/admin/colleges";

export const metadata: Metadata = { title: "Colleges" };

export default function CollegesPage() {
  return <CollegesScreen />;
}
