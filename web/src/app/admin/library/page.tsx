import { type Metadata } from "next";

import { LibraryScreen } from "@/components/admin/library";

export const metadata: Metadata = { title: "Task library" };

export default function LibraryPage() {
  return <LibraryScreen />;
}
