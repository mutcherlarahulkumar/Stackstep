import { type Metadata } from "next";

import { ReviewLabLibraryScreen } from "@/components/review-lab/library-screen";

export const metadata: Metadata = { title: "Review lab" };

export default function ReviewLabPage() {
  return <ReviewLabLibraryScreen />;
}
