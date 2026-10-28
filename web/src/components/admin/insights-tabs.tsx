import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", href: "/admin/overview", label: "Overview" },
  { id: "report", href: "/admin/report", label: "Weekly report" },
] as const;

/** Insights holds two views; this switches between them (print hides it). */
export function InsightsTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Insights" className="bg-muted inline-flex w-fit rounded-lg p-1 print:hidden">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={cn(
            "focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2",
            t.id === active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
