import { type Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { PRIVACY } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      intro="Stackstep runs practice internships for students. This page says, in plain words, what we keep about you, who can see it and what you can do about it."
      sections={PRIVACY}
      other={{ href: "/terms", label: "terms of use" }}
    />
  );
}
