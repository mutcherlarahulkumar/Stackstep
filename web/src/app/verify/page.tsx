import { type Metadata } from "next";

import { VerifyLookupScreen } from "@/components/certificate/certificate";

export const metadata: Metadata = { title: "Check a certificate" };

export default function VerifyLookupPage() {
  return <VerifyLookupScreen />;
}
