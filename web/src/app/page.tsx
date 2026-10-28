import {
  BadgeCheck,
  Bell,
  Bot,
  Building2,
  ChartColumn,
  ClipboardCheck,
  Code2,
  FileSpreadsheet,
  GitPullRequest,
  IndianRupee,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { HeroDemo } from "@/components/home/hero-demo";
import { Reveal } from "@/components/home/reveal";
import { PrimaryCta, SiteNav } from "@/components/home/site-nav";
import { VerifyBand } from "@/components/home/verify-band";
import { Wordmark } from "@/components/app/brand";
import { Button } from "@/components/ui/button";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: UserRoundCheck, title: "Sign in with GitHub", body: "Your GitHub account is your workspace login and where your code lives." },
  { icon: IndianRupee, title: "Pick a cohort, pay by UPI", body: "Fill a short form, scan the QR, upload the screenshot. We confirm your seat within a day." },
  { icon: MessagesSquare, title: "Work with your team", body: "30 or 60 days of tickets, standups and reviews from your lead, on your own schedule." },
  { icon: BadgeCheck, title: "Earn a verifiable certificate", body: "Finish the work and get a certificate with a public link recruiters can check." },
];

const FEATURES: { icon: LucideIcon; title: string; body: string; wide?: boolean }[] = [
  {
    icon: MessagesSquare,
    title: "A team in your chats",
    body: "A team lead, a PM and teammates message you like a real job, with standups, tickets, nudges and code reviews. Every automatic reply is clearly labelled.",
    wide: true,
  },
  { icon: GitPullRequest, title: "Real pull requests", body: "Every task is a branch and a PR in your own GitHub repo, built on your machine." },
  { icon: ClipboardCheck, title: "Reviews on your actual code", body: "Mentors review against a rubric and quote your diff. Request changes, fix, hand in again." },
  { icon: Bot, title: "AI helper that teaches", body: "Stuck? Ask for a hint, a code explanation or a review. Credits keep it a helper, not a crutch." },
  { icon: Code2, title: "DSA practice pad", body: "Solve problems in the browser and check them against tests instantly." },
  { icon: ListChecks, title: "A board that keeps you moving", body: "To do, waiting for review, done. Quizzes, resources and deadlines in one place." },
  { icon: NotebookPen, title: "Notes you can share", body: "Keep notes per task and share them with your reviewer when you hand in." },
  { icon: Trophy, title: "Points and progress", body: "On-time work earns points. A weekly recap shows what you shipped." },
  { icon: Smartphone, title: "Web and phone", body: "Chat and tasks in the Android and iOS app, with notifications when your lead replies.", wide: true },
  { icon: BadgeCheck, title: "A certificate that checks out", body: "Each one has a code and a public page, so a recruiter can confirm it in seconds." },
];

const COLLEGE: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ChartColumn, title: "Placement overview", body: "Who's active, stuck or ahead, per cohort, at a glance." },
  { icon: FileSpreadsheet, title: "Weekly report", body: "A printable report for your placement cell, every week." },
  { icon: Building2, title: "Cohorts and rosters", body: "Import students from a CSV and run batches with seat limits." },
  { icon: Bell, title: "Nudges", body: "Message a whole cohort in one go when deadlines slip." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Is this a real job?", a: "No. It's a practice internship. The team is simulated, the work is real. You build real projects in your own GitHub, reviewed by real mentors." },
  { q: "Who reviews my work?", a: "Mentors. They may use AI to draft a review, but a person always decides and sends it." },
  { q: "How do I pay?", a: "By UPI. After you pick a cohort we show a QR and UPI ID; pay the exact fee and upload the screenshot with the transaction ID. We confirm within a day." },
  {
    q: "What if I paid the wrong amount?",
    a: "We'll tell you exactly what's wrong in your application, and you can pay the balance, switch to the cohort you paid for, or upload a clearer screenshot. Money we've confirmed carries over.",
  },
  { q: "Are fees refundable?", a: "No. Fees are non-refundable under any circumstances, so check the cohort and amount before you pay." },
  { q: "How do recruiters check my certificate?", a: "Every certificate has a 12-character code and a public page. Anyone can check it from “Verify a certificate”, no account needed." },
];

const TRACKS = ["React", "Next.js", "Node.js", "TypeScript", "REST APIs", "Postgres", "Git & GitHub", "Testing", "DSA", "Flutter", "Code review", "Agile standups"];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <SiteNav />
      <main id="main" className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-14 pb-28 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div className="flex flex-col items-start text-left">
              <p className="animate-enter bg-primary/10 text-primary mb-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium">
                <Sparkles className="size-3.5" aria-hidden /> 30- and 60-day virtual internships
              </p>
              <h1 className="animate-enter max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl [animation-delay:80ms]">
                Build it step by step.{" "}
                <span className="animate-pan bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent dark:from-violet-400 dark:via-fuchsia-300 dark:to-violet-400">
                  Prove it with real work.
                </span>
              </h1>
              <p className="animate-enter text-muted-foreground mt-6 max-w-lg text-lg text-pretty [animation-delay:160ms]">
                Work like you&apos;re on a real software team, with tickets from your lead, pull requests on GitHub, reviews that quote your actual code, and a certificate anyone can verify.
              </p>
              <div className="animate-enter mt-9 flex flex-wrap gap-3 [animation-delay:240ms]">
                <PrimaryCta />
                <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
                  <Link href="/verify">
                    <ShieldCheck data-icon="inline-start" aria-hidden /> Verify a certificate
                  </Link>
                </Button>
              </div>
              <p className="animate-enter text-muted-foreground mt-5 text-sm [animation-delay:320ms]">Free to sign in · Pay by UPI when you join a cohort</p>
            </div>
            <HeroDemo />
          </div>
        </section>

        {/* Tracks marquee */}
        <div className="border-y py-4" aria-label="What you'll practise">
          <div className="flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
            <ul className="animate-marquee flex shrink-0 gap-3 pr-3 hover:[animation-play-state:paused]">
              {[...TRACKS, ...TRACKS].map((t, i) => (
                <li key={`${t}-${i}`} aria-hidden={i >= TRACKS.length} className="text-muted-foreground bg-muted/60 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* How it works */}
        <section id="how" aria-labelledby="how-h" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 id="how-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              From sign-in to certificate in four steps
            </h2>
            <p className="text-muted-foreground mt-3 text-lg">No interviews, no waiting lists. Pick a cohort and start shipping.</p>
          </Reveal>
          <ol className="relative mt-14 grid gap-6 md:grid-cols-4">
            <span className="from-primary/0 via-primary/40 to-primary/0 absolute top-6 right-[12%] left-[12%] hidden h-px bg-gradient-to-r md:block" aria-hidden />
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} i={i} className="relative flex flex-col items-center text-center">
                <span className="bg-background ring-primary/30 text-primary relative grid size-12 place-items-center rounded-full shadow-sm ring-1">
                  <s.icon className="size-5" aria-hidden />
                  <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-5 place-items-center rounded-full text-[11px] font-semibold">{i + 1}</span>
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="text-muted-foreground mt-1.5 max-w-60 text-sm leading-relaxed">{s.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-h" className="bg-muted/40 scroll-mt-16 border-y">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
            <Reveal className="max-w-2xl">
              <h2 id="features-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything a first job teaches, without the first job
              </h2>
              <p className="text-muted-foreground mt-3 text-lg">The habits recruiters look for, like shipping on time, taking review and explaining your work.</p>
            </Reveal>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <Reveal
                  as="li"
                  key={f.title}
                  i={i % 4}
                  className={`group bg-card ring-foreground/10 hover:ring-primary/40 relative overflow-hidden rounded-2xl p-6 ring-1 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lg ${f.wide ? "lg:col-span-2" : ""}`}
                >
                  <span className="from-primary/15 pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-gradient-to-br to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" aria-hidden />
                  <span className="bg-primary/10 text-primary inline-flex size-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{f.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* For colleges */}
        <section id="colleges" aria-labelledby="colleges-h" className="mx-auto grid w-full max-w-6xl scroll-mt-20 gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <Reveal>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">For placement cells</p>
            <h2 id="colleges-h" className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Run internships for a whole batch
            </h2>
            <p className="text-muted-foreground mt-3 text-lg">Give every student industry-style experience and see exactly who&apos;s doing the work, without running it yourself.</p>
          </Reveal>
          <ul className="grid gap-4 sm:grid-cols-2">
            {COLLEGE.map((c, i) => (
              <Reveal as="li" key={c.title} i={i} className="bg-card ring-foreground/10 rounded-2xl p-5 ring-1">
                <c.icon className="text-primary size-5" aria-hidden />
                <h3 className="mt-3 font-semibold">{c.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{c.body}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* Verify */}
        <section aria-labelledby="verify-h" className="px-4 sm:px-6">
          <Reveal className="from-primary relative mx-auto flex max-w-6xl flex-col items-start gap-6 overflow-hidden rounded-3xl bg-gradient-to-br to-fuchsia-600 p-8 text-white shadow-xl sm:p-12 lg:flex-row lg:items-center lg:justify-between">
            <div className="animate-glow pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-white/20 blur-3xl" aria-hidden />
            <div className="relative max-w-lg">
              <ShieldCheck className="size-8 opacity-90" aria-hidden />
              <h2 id="verify-h" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Recruiter? Check a certificate in seconds.
              </h2>
              <p className="mt-2 text-white/85">Enter the code printed on the certificate. No account needed.</p>
            </div>
            <div className="relative w-full max-w-md text-foreground [&_[role=alert]]:text-white">
              <VerifyBand />
            </div>
          </Reveal>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-h" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-24 sm:px-6">
          <Reveal>
            <h2 id="faq-h" className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Questions
            </h2>
          </Reveal>
          <div className="mt-10 divide-y rounded-2xl border">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} i={i}>
                <details className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="text-muted-foreground transition-transform duration-300 group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-lg font-medium">Ready when you are.</p>
            <PrimaryCta />
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6">
          <Wordmark className="text-foreground" />
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link href="/verify" className="hover:text-foreground">
              Verify a certificate
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
          <span>© Stackstep</span>
        </div>
      </footer>
    </div>
  );
}
