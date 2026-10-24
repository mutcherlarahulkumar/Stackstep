import { type Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { TERMS } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro="These are the rules for taking part in a Stackstep internship. They're short on purpose."
      sections={TERMS}
      other={{ href: "/privacy", label: "privacy notice" }}
    />
  );
}
