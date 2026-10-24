import Link from "next/link";

import { Wordmark } from "@/components/app/brand";
import { LEGAL_UPDATED, type LegalSection } from "@/lib/legal";

/** A readable, printable page for the privacy notice and terms. Public; no sign-in. */
export function LegalPage({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center border-b px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="Stackstep home">
          <Wordmark />
        </Link>
      </header>
      <main id="main" className="animate-enter mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 leading-relaxed text-pretty">{intro}</p>
        {sections.map((s) => (
          <section key={s.heading} className="mt-8" aria-labelledby={slug(s.heading)}>
            <h2 id={slug(s.heading)} className="text-lg font-semibold">
              {s.heading}
            </h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 leading-relaxed">
              {s.points.map((p) => (
                <li key={p} className="text-pretty">
                  {p}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-muted-foreground mt-10 border-t pt-6 text-sm">
          See also the{" "}
          <Link href={other.href} className="text-foreground underline underline-offset-4">
            {other.label}
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
