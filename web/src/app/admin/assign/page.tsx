import { type Metadata } from "next";

import { AssignFlow } from "@/components/admin/assign-flow";

export const metadata: Metadata = { title: "Assign a task" };

export default function AssignPage() {
  return <AssignFlow />;
}
