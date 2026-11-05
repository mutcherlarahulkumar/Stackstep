import { type Metadata } from "next";

import { MailScreen } from "@/components/mail/mail-screen";

export const metadata: Metadata = { title: "Mail" };

export default function MailPage() {
  return <MailScreen />;
}
