import { type Metadata } from "next";
import { Suspense } from "react";

import { InboxScreen } from "@/components/admin/inbox";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  // The inbox reads ?student= links from profiles, which only exist at request time.
  return (
    <Suspense>
      <InboxScreen />
    </Suspense>
  );
}
