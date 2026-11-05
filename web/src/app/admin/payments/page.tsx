import { type Metadata } from "next";

import { PaymentsScreen } from "@/components/admin/payments";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return <PaymentsScreen />;
}
