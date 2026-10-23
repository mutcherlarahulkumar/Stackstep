import { ArrowRight, Bot, GitPullRequest, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { GitHubMark, Wordmark } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Bot, title: "An AI team lead", body: "Daily standups, tickets and code reviews in a chat — with realistic reply times." },
  { icon: GitPullRequest, title: "Real pull requests", body: "Every task is a branch and a PR in your own GitHub repo, built on your machine." },
  { icon: ShieldCheck, title: "Proof recruiters can check", body: "Your certificate links to the repos, live sites and merged PRs behind it." },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-6">
        <Wordmark />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col items-center px-6 pt-16 pb-24 text-center sm:pt-24">
        <p className="bg-primary/10 text-primary mb-6 rounded-full px-3 py-1 text-sm font-medium">30- and 60-day virtual internships</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Build it step by step. <span className="text-primary">Prove it with real work.</span>
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg text-pretty">
          Work like you&apos;re on a real software team: tickets from your lead, pull requests on GitHub, reviews that quote your actual code.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-11 px-5">
            <Link href="/login">
              <GitHubMark /> Start with GitHub
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="h-11 px-5">
            <a href="#how">
              How it works <ArrowRight data-icon="inline-end" aria-hidden />
            </a>
          </Button>
        </div>
        <section id="how" aria-label="How it works" className="mt-24 grid w-full max-w-5xl gap-4 text-left sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card ring-foreground/10 rounded-xl p-5 ring-1">
              <span className="bg-primary/10 text-primary inline-flex size-9 items-center justify-center rounded-lg">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-medium">{title}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="text-muted-foreground border-t px-6 py-6 text-center text-sm">© Stackstep</footer>
    </div>
  );
}
