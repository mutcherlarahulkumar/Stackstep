import { type Metadata } from "next";

import { ReviewsScreen } from "@/components/admin/reviews";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return <ReviewsScreen />;
}
