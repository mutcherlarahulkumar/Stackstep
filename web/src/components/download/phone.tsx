"use client";

import {
  CalendarDays,
  Check,
  Gift,
  Hand,
  Lock,
  MessageCircle,
  Mic,
  MonitorUp,
  SquareKanban,
  Video,
} from "lucide-react";
import { useId, type CSSProperties, type ReactNode } from "react";

import { BrandMark } from "@/components/app/brand";
import { cn } from "@/lib/utils";

/**
 * A phone held in a hand, drawn in CSS and SVG. The palm sits behind the phone and the
 * thumb and fingertips in front of it, so the phone looks gripped. `style` takes the
 * scroll-driven transform from the page.
 */
export function PhoneInHand({
  screen,
  style,
  className,
  scale = 1,
}: {
  screen: number;
  style?: CSSProperties;
  className?: string;
  scale?: number;
}) {
  return (
    <div
      className={cn("relative mx-auto shrink-0", className)}
      style={{ width: 340 * scale, height: 600 * scale }}
      aria-hidden
    >
      <div
        className="absolute top-0 left-0 h-[600px] w-[340px] origin-top-left [perspective:1400px]"
        style={{ transform: `scale(${scale})` }}
      >
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out will-change-transform [transform-style:preserve-3d]"
          style={style}
        >
          <HandArt className="absolute inset-0 z-0" layer="back" />
          <div className="absolute top-4 left-[42px] z-10 h-[520px] w-[256px] rounded-[46px] bg-zinc-900 p-[9px] shadow-[0_40px_80px_-20px_rgb(0_0_0/0.45)] ring-1 ring-white/10 dark:bg-zinc-800">
            <span className="absolute top-[110px] -left-[3px] h-12 w-[3px] rounded-l bg-zinc-700" />
            <span className="absolute top-[170px] -left-[3px] h-12 w-[3px] rounded-l bg-zinc-700" />
            <span className="absolute top-[130px] -right-[3px] h-16 w-[3px] rounded-r bg-zinc-700" />
            <div className="bg-background relative h-full w-full overflow-hidden rounded-[38px]">
              <span className="absolute top-2 left-1/2 z-20 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
              <StatusBar />
              {SCREENS.map((S, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute inset-x-0 top-9 bottom-0 transition-all duration-500 ease-out",
                    i === screen
                      ? "translate-y-0 opacity-100"
                      : i < screen
                        ? "-translate-y-4 opacity-0"
                        : "translate-y-4 opacity-0",
                  )}
                >
                  <S />
                </div>
              ))}
            </div>
          </div>
          <HandArt
            className="pointer-events-none absolute inset-0 z-20"
            layer="front"
          />
        </div>
      </div>
    </div>
  );
}

function HandArt({
  className,
  layer,
}: {
  className?: string;
  layer: "back" | "front";
}) {
  // Ids must be unique per drawing: a copy inside a hidden element would break shared ones.
  const id = useId().replace(/:/g, "");
  const skin = `url(#${id}-skin)`;
  return (
    <svg viewBox="0 0 340 600" className={className}>
      <defs>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6d2b2" />
          <stop offset="0.6" stopColor="#e8b48f" />
          <stop offset="1" stopColor="#cf9370" />
        </linearGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.8" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-wrist`}>
          <rect width="340" height="600" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      {layer === "back" ? (
        <g mask={`url(#${id}-wrist)`}>
          {/* Palm and wrist, cupping the phone from below. */}
          <path
            d="M30 430 C18 480 40 530 92 560 L104 600 L262 600 L272 556 C322 520 336 470 326 420 C318 380 296 350 270 340 L80 340 C52 360 36 395 30 430 Z"
            fill={skin}
          />
          <path
            d="M96 556 C150 586 222 584 270 552"
            fill="none"
            stroke="#b97c5a"
            strokeOpacity="0.35"
            strokeWidth="3"
          />
        </g>
      ) : (
        <g>
          {/* Thumb resting over the left edge. */}
          <path
            d="M34 500 C14 462 20 412 52 386 C70 372 92 380 96 400 C100 430 86 462 78 492 C70 520 46 524 34 500 Z"
            fill={skin}
          />
          <path
            d="M60 390 C72 384 86 390 88 402"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.5"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Fingertips curling over the right edge. */}
          {[286, 338, 390, 440].map((y, i) => (
            <g key={y}>
              <rect
                x={284 - i * 3}
                y={y}
                width={50}
                height={40}
                rx={20}
                fill={skin}
              />
              <path
                d={`M${292 - i * 3} ${y + 11} q9 -6 18 0`}
                fill="none"
                stroke="#fff"
                strokeOpacity="0.45"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function StatusBar() {
  return (
    <div className="text-foreground absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between px-6 text-[11px] font-semibold">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className="flex items-end gap-px">
          {[4, 6, 8, 10].map((h) => (
            <span
              key={h}
              className="bg-foreground w-[3px] rounded-sm"
              style={{ height: h }}
            />
          ))}
        </span>
        <span className="border-foreground ml-1 h-[10px] w-5 rounded-[3px] border p-px">
          <span className="bg-foreground block h-full w-3/4 rounded-[1px]" />
        </span>
      </span>
    </div>
  );
}

function AppBar({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b px-4 pt-1 pb-2.5">
      <BrandMark className="size-6" />
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-muted-foreground ml-auto">{icon}</span>
    </div>
  );
}

function TabBar({ active }: { active: number }) {
  const tabs = [MessageCircle, SquareKanban, CalendarDays, Video];
  return (
    <div className="bg-background/90 absolute inset-x-0 bottom-0 flex justify-around border-t px-4 pt-2 pb-5 backdrop-blur">
      {tabs.map((Icon, i) => (
        <span
          key={i}
          className={cn(
            "grid size-9 place-items-center rounded-xl",
            i === active
              ? "bg-primary/12 text-primary"
              : "text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      ))}
    </div>
  );
}

function ChatsScreen() {
  return (
    <div className="relative h-full">
      <AppBar
        title="Priya, team lead"
        icon={<MessageCircle className="size-4" />}
      />
      <div className="flex flex-col gap-2 p-3 text-[12px]">
        <Bubble who="them">
          Morning! Your first ticket is on the board. Build the login form.
        </Bubble>
        <Bubble who="them">Ping me if the API errors confuse you.</Bubble>
        <Bubble who="me">On it. Pushing a branch before lunch 🚀</Bubble>
        <Bubble who="them" react="👍">
          Love it. I&apos;ll review as soon as the PR is up.
        </Bubble>
        <span className="text-muted-foreground flex items-center gap-1 pl-1 text-[11px]">
          <span className="bg-muted-foreground/60 size-1.5 animate-pulse rounded-full" />
          <span className="bg-muted-foreground/60 size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
          <span className="bg-muted-foreground/60 size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
          Priya is typing
        </span>
      </div>
      <TabBar active={0} />
    </div>
  );
}

function Bubble({
  who,
  children,
  react,
}: {
  who: "me" | "them";
  children: ReactNode;
  react?: string;
}) {
  return (
    <div
      className={cn(
        "relative max-w-[80%] rounded-2xl px-3 py-2 leading-snug",
        who === "me"
          ? "from-primary self-end rounded-br-md bg-gradient-to-br to-fuchsia-500 text-white"
          : "bg-muted self-start rounded-bl-md",
      )}
    >
      {children}
      {react ? (
        <span className="bg-background absolute -right-2 -bottom-2 rounded-full border px-1 text-[10px]">
          {react}
        </span>
      ) : null}
    </div>
  );
}

function TasksScreen() {
  const cards: { t: string; tag: string; done?: boolean; tone: string }[] = [
    {
      t: "Login form with validation",
      tag: "Feature",
      tone: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    },
    {
      t: "Fix the navbar on phones",
      tag: "Bug",
      tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    },
    {
      t: "Daily standup",
      tag: "Standup",
      done: true,
      tone: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    },
  ];
  return (
    <div className="relative h-full">
      <AppBar title="Your board" icon={<SquareKanban className="size-4" />} />
      <div className="flex flex-col gap-2 p-3">
        <p className="text-muted-foreground text-[11px] font-semibold uppercase">
          To do
        </p>
        {cards.map((c) => (
          <div key={c.t} className="bg-card rounded-xl border p-2.5 shadow-sm">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                c.tone,
              )}
            >
              {c.tag}
            </span>
            <p
              className={cn(
                "mt-1.5 text-[12px] font-medium",
                c.done && "text-muted-foreground line-through",
              )}
            >
              {c.t}
            </p>
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-[10px]">
              {c.done ? <Check className="size-3 text-emerald-600" /> : null}
              {c.done ? "Handed in" : "Due today, 6 PM"}
            </p>
          </div>
        ))}
        <div className="border-primary/50 bg-primary/5 text-primary flex items-center gap-2 rounded-xl border border-dashed p-2.5 text-[11px]">
          <Gift className="size-3.5" /> A surprise task lands today
        </div>
      </div>
      <TabBar active={1} />
    </div>
  );
}

function CalendarScreen() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="relative h-full">
      <AppBar title="Calendar" icon={<CalendarDays className="size-4" />} />
      <div className="grid grid-cols-7 px-2 py-2 text-center">
        {days.map((d, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-muted-foreground text-[9px]">{d}</span>
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-[11px]",
                i === 1 && "bg-primary text-primary-foreground font-semibold",
              )}
            >
              {9 + i}
            </span>
            <span
              className={cn(
                "size-1 rounded-full",
                [1, 2, 4].includes(i) ? "bg-primary" : "bg-transparent",
              )}
            />
          </span>
        ))}
      </div>
      <div className="relative mx-2 h-[300px] border-t">
        {["10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM"].map((h, i) => (
          <span
            key={h}
            className="absolute inset-x-0 border-t border-dashed"
            style={{ top: i * 50 }}
          >
            <span className="text-muted-foreground absolute -top-2 left-0 bg-transparent text-[9px]">
              {h}
            </span>
          </span>
        ))}
        <div className="border-primary/50 bg-primary/15 absolute top-[28px] right-2 left-10 h-[24px] rounded-md border px-1.5 text-[10px] leading-[22px] font-medium">
          Login form arrives
        </div>
        <div className="absolute top-[78px] right-0 left-8 flex items-center">
          <span className="size-2 rounded-full bg-red-500" />
          <span className="h-0.5 flex-1 bg-red-500" />
        </div>
        <div className="absolute top-[200px] right-2 left-10 h-[50px] rounded-md border border-rose-500/50 bg-rose-500/15 px-1.5 py-1 text-[10px] font-medium">
          Git branching, live
          <span className="text-muted-foreground block font-normal">
            2 PM to 3 PM
          </span>
        </div>
        <div className="bg-muted text-muted-foreground absolute top-[128px] right-2 left-10 flex h-[24px] items-center gap-1 rounded-md border px-1.5 text-[10px]">
          Code review <Lock className="ml-auto size-2.5" />
        </div>
      </div>
      <TabBar active={2} />
    </div>
  );
}

function ClassScreen() {
  return (
    <div className="relative h-full bg-zinc-950 text-white">
      <div className="flex items-center gap-2 px-4 pt-1 pb-2 text-[12px]">
        <span className="flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold">
          <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
        </span>
        Git branching
      </div>
      <div className="relative mx-3 aspect-video overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-white/10">
        <div className="absolute inset-3 rounded-md bg-zinc-900 p-2 font-mono text-[8px] leading-relaxed text-emerald-300">
          $ git switch -c feature/login
          <br />$ git add . && git commit
          <br />$ git push -u origin
        </div>
        <svg viewBox="0 0 100 56" className="absolute inset-0">
          <path
            d="M18 30 C30 22 44 40 60 26"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute right-2 bottom-2 animate-bounce text-lg">
          👏
        </span>
      </div>
      <div className="mx-3 mt-3 flex flex-col gap-1.5 text-[11px]">
        <p>
          <span className="font-semibold text-violet-300">Aarav</span> what if
          two of us edit the same line?
        </p>
        <p>
          <span className="font-semibold text-emerald-300">Mentor</span> great
          question, that is a merge conflict
        </p>
        <p className="rounded-md bg-white/5 p-1.5">
          <span className="text-amber-300">Q&amp;A</span> How do I undo a
          commit? <span className="text-white/60">▲ 12</span>
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-5 flex justify-center gap-3">
        {[Mic, MonitorUp, Hand].map((Icon, i) => (
          <span
            key={i}
            className={cn(
              "grid size-9 place-items-center rounded-full",
              i === 2 ? "bg-amber-400 text-zinc-900" : "bg-white/10",
            )}
          >
            <Icon className="size-4" />
          </span>
        ))}
      </div>
    </div>
  );
}

const SCREENS = [ChatsScreen, TasksScreen, CalendarScreen, ClassScreen];
export const SCREEN_COUNT = SCREENS.length;
