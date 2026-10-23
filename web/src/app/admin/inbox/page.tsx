import { type Metadata } from "next";

import { InboxScreen } from "@/components/admin/inbox";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return <InboxScreen />;
}
