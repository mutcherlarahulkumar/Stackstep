import { BadgeCheck, Check, GitPullRequest, MessageCircle } from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const d = (s: number) => ({ ["--d" as string]: s }) as CSSProperties;

function Bubble({ from, children, delay, mine }: { from?: string; children: ReactNode; delay: number; mine?: boolean }) {
  return (
    <div className={cn("animate-pop-in flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start")} style={d(delay)}>
      {from ? <span className="text-muted-foreground text-[10px] font-medium">{from}</span> : null}
      <p className={cn("rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm", mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}>{children}</p>
    </div>
  );
}

/** A looping-free, CSS-only picture of a day at Stackstep: a standup, a PR, an approval. */
export function HeroDemo() {
  return (
    <div className="relative mx-auto w-full max-w-md select-none" aria-hidden>
      {/* Soft colour behind the cards. */}
      <div className="animate-glow from-primary/40 absolute -inset-10 -z-10 rounded-full bg-gradient-to-tr via-fuchsia-400/25 to-sky-400/30 blur-3xl" />

      <div className="bg-card/90 animate-pop-in ring-foreground/10 rounded-2xl shadow-2xl ring-1 backdrop-blur" style={d(0.1)}>
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <span className="grid size-8 place-items-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-600 dark:text-violet-300">PS</span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Priya Sharma</span>
            <span className="text-muted-foreground text-[11px]">Team lead · online</span>
          </div>
          <MessageCircle className="text-muted-foreground ml-auto size-4" />
        </div>
        <div className="flex flex-col gap-2.5 p-4">
          <Bubble from="Priya · 9:30" delay={0.5}>
            Morning! Today we add search to the product list. Ticket&apos;s on your board 🚀
          </Bubble>
          <Bubble mine delay={1.3}>
            On it. Opening a branch now.
          </Bubble>
          <div className="animate-pop-in flex items-center gap-1 self-start rounded-2xl bg-muted px-3 py-2.5" style={d(2.0)}>
            {[0, 0.15, 0.3].map((x) => (
              <span key={x} className="animate-typing bg-muted-foreground size-1.5 rounded-full" style={{ animationDelay: `${x}s` }} />
            ))}
          </div>
          <Bubble from="Priya · 4:12" delay={2.8}>
            Reviewed your PR. Clean debounce. One nit on the empty state, then ship it.
          </Bubble>
        </div>
      </div>

      <div className="animate-float absolute -right-4 -bottom-10 w-60 sm:-right-12" style={{ animationDelay: "1s" }}>
        <div className="bg-card animate-pop-in ring-foreground/10 rounded-xl p-3.5 shadow-xl ring-1" style={d(3.6)}>
          <div className="flex items-center gap-2 text-xs font-medium">
            <GitPullRequest className="size-4 text-emerald-600 dark:text-emerald-400" />
            Add product search
            <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Approved</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 font-mono text-[10px]">
            <span className="text-emerald-600 dark:text-emerald-400">+128</span>
            <span className="text-rose-600 dark:text-rose-400">−14</span>
            <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <span className="block h-full w-[86%] rounded-full bg-emerald-500" />
            </span>
          </div>
        </div>
      </div>

      <div className="animate-float absolute -top-8 -left-4 sm:-left-14" style={{ animationDelay: "2.5s" }}>
        <div className="bg-card animate-pop-in ring-foreground/10 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg ring-1" style={d(4.3)}>
          <span className="grid size-6 place-items-center rounded-full bg-amber-500/15 text-amber-600">
            <Check className="size-3.5" />
          </span>
          <span className="text-xs font-medium">+20 points · on time</span>
        </div>
      </div>

      <div className="animate-float absolute -bottom-16 -left-2 sm:-left-8" style={{ animationDelay: "0.4s" }}>
        <div className="bg-card animate-pop-in ring-foreground/10 flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg ring-1" style={d(5)}>
          <BadgeCheck className="text-primary size-4" />
          <span className="text-xs font-medium">Certificate verified</span>
        </div>
      </div>
    </div>
  );
}
