"use client";

import { Flame, Monitor, RotateCcw, RotateCw, Sprout } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { type Attendance, type AttendanceDay } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

function dayLabel(d: AttendanceDay): string {
  switch (d.status) {
    case "present":
      return `Day ${d.day}, ${fmtDay(d.date)}. Present, seat ${d.seat ?? ""}`;
    case "missed":
      return `Day ${d.day}, ${fmtDay(d.date)}. Missed`;
    case "pending":
      return `Day ${d.day}, today. Not opened yet`;
  }
}

/** A bare, leafless tree for a missed day. */
export function DeadTree({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V11" />
      <path d="M12 15l-4-4M8 11l-1-3M8 11l-3 0" />
      <path d="M12 13l4-5M16 8l0-3M16 8l3-1" />
      <path d="M12 11l-1-5M11 6l-2-2" />
      <path d="M9 22h6" />
    </svg>
  );
}

/** Totals and the streak, in a row of small tiles. */
export function AttendanceStats({ a }: { a: Attendance }) {
  const total = a.present + a.missed;
  const pct = total === 0 ? 0 : Math.round((a.present / total) * 100);
  const tiles = [
    { label: "Present", value: a.present, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Missed", value: a.missed, tone: "text-stone-500" },
    { label: "Attendance", value: `${pct}%`, tone: "text-primary" },
    { label: "Streak", value: a.streak, tone: "text-amber-600 dark:text-amber-400", icon: Flame },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="attendance-stats">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card rounded-xl border p-3">
          <dt className="text-muted-foreground text-xs">{t.label}</dt>
          <dd className={cn("mt-0.5 flex items-center gap-1 text-2xl font-semibold tabular-nums", t.tone)}>
            {t.icon ? <t.icon className="size-5" aria-hidden /> : null}
            {t.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Days as seats, like picking seats at the cinema: each week is a row facing the "screen".
 * A computer with the seat number means present (the seat is the order they arrived in),
 * a dead tree means missed, and a dashed seat is today, not opened yet.
 */
export function AttendanceSeats({ a, compact = false }: { a: Attendance; compact?: boolean }) {
  const rows: AttendanceDay[][] = [];
  a.days.forEach((d, i) => {
    const r = Math.floor(i / 7);
    (rows[r] ??= []).push(d);
  });
  if (a.days.length === 0) {
    return <p className="text-muted-foreground text-sm">Attendance starts on Day 1.</p>;
  }
  return (
    <div className="flex flex-col items-center gap-2" data-testid="attendance-seats">
      <div className="mb-2 w-full max-w-md">
        <div className="from-primary/0 via-primary/50 to-primary/0 h-1 rounded-full bg-gradient-to-r" aria-hidden />
        <p className="text-muted-foreground mt-1 text-center text-[10px] tracking-[0.3em] uppercase">Your internship</p>
      </div>
      <ol className="flex flex-col gap-1.5" aria-label="Attendance by day">
        {rows.map((row, r) => (
          <li key={r} className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-6 text-right text-[10px] font-medium tabular-nums">W{r + 1}</span>
            <ol className="flex gap-1.5">
              {row.map((d) => (
                <li key={d.date}>
                  <Seat d={d} compact={compact} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <ul className="text-muted-foreground mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <li className="flex items-center gap-1.5">
          <Monitor className="size-3.5 text-emerald-600" aria-hidden /> Present, with seat number
        </li>
        <li className="flex items-center gap-1.5">
          <DeadTree className="size-3.5 text-stone-500" /> Missed
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-dashed" aria-hidden /> Today
        </li>
      </ul>
    </div>
  );
}

function Seat({ d, compact }: { d: AttendanceDay; compact: boolean }) {
  const size = compact ? "size-9" : "size-11";
  return (
    <span
      title={dayLabel(d)}
      aria-label={dayLabel(d)}
      role="img"
      data-status={d.status}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-t-lg rounded-b-sm border text-[9px] leading-none font-semibold tabular-nums",
        size,
        d.status === "present" && "border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        d.status === "missed" && "border-stone-400/40 bg-stone-500/10 text-stone-500",
        d.status === "pending" && "border-primary/60 text-primary border-dashed",
      )}
    >
      {d.status === "present" ? <Monitor className={compact ? "size-3.5" : "size-4"} aria-hidden /> : null}
      {d.status === "missed" ? <DeadTree className={compact ? "size-4" : "size-5"} /> : null}
      {d.status === "pending" ? <Sprout className="size-4" aria-hidden /> : null}
      {d.status === "present" && d.seat ? <span className="mt-0.5">#{d.seat}</span> : null}
      <span className="bg-background text-muted-foreground absolute -bottom-1.5 rounded px-0.5 text-[8px] font-medium">{d.day}</span>
    </span>
  );
}

/** A leafy tree drawn upright; the canopy tint varies a little per day so the forest isn't uniform. */
function GreenTree({ hue }: { hue: number }) {
  return (
    <svg viewBox="0 0 40 64" className="h-full w-full overflow-visible drop-shadow-[0_6px_4px_rgb(0_0_0/0.25)]" aria-hidden>
      <rect x="17.5" y="40" width="5" height="22" rx="2" fill="#7c4a2a" />
      <ellipse cx="20" cy="30" rx="16" ry="17" fill={`hsl(${hue} 55% 38%)`} />
      <ellipse cx="14" cy="24" rx="10" ry="11" fill={`hsl(${hue} 60% 46%)`} />
      <ellipse cx="25" cy="18" rx="9" ry="10" fill={`hsl(${hue} 65% 52%)`} />
      <ellipse cx="18" cy="12" rx="5" ry="4" fill="#fff" opacity="0.18" />
    </svg>
  );
}

function BareTree() {
  return (
    <svg viewBox="0 0 40 64" className="h-full w-full overflow-visible drop-shadow-[0_6px_4px_rgb(0_0_0/0.2)]" aria-hidden fill="none" stroke="#6b5a4c" strokeLinecap="round">
      <path d="M20 62V28" strokeWidth="4" />
      <path d="M20 44l-9-9M11 35l-2-7M11 35l-6 1" strokeWidth="2.5" />
      <path d="M20 38l8-11M28 27l0-7M28 27l6-2" strokeWidth="2.5" />
      <path d="M20 30l-3-12M17 18l-4-4M20 30l4-12" strokeWidth="2" />
    </svg>
  );
}

function Sapling() {
  return (
    <svg viewBox="0 0 40 64" className="h-full w-full overflow-visible" aria-hidden>
      <path d="M20 62V48" stroke="#5b8c3a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 52c-6 0-9-4-9-8 5 0 9 3 9 8zM20 50c5 0 8-4 8-8-5 0-8 3-8 8z" fill="#7cc04a" />
    </svg>
  );
}

const TILT = 58;

/**
 * The internship as a forest you can turn around: a green tree for every day present, a
 * bare one for every day missed, and a sapling for today. Drag (or use the buttons) to rotate.
 */
export function Forest({ a, className }: { a: Attendance; className?: string }) {
  const [angle, setAngle] = useState(-40);
  const drag = useRef<{ x: number; a: number } | null>(null);
  // A roughly square plot, whatever the number of days.
  const cols = Math.max(2, Math.ceil(Math.sqrt(a.days.length)));
  const rows = Math.max(1, Math.ceil(a.days.length / cols));
  const tile = a.days.length > 36 ? 52 : 64;
  const onDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, a: angle };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (drag.current) setAngle(drag.current.a + (e.clientX - drag.current.x) * 0.4);
  };
  const onUp = () => {
    drag.current = null;
  };
  const ground: CSSProperties = {
    width: cols * tile,
    height: rows * tile,
    transform: `rotateX(${TILT}deg) rotateZ(${angle}deg)`,
    transformStyle: "preserve-3d",
  };
  // Trees face the viewer whichever way the ground turns.
  const upright = `rotateZ(${-angle}deg) rotateX(${-TILT}deg)`;
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)} data-testid="attendance-forest">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950" aria-hidden />
      <div className="absolute top-6 right-10 size-14 rounded-full bg-amber-200 opacity-80 blur-[1px] dark:bg-slate-200 dark:opacity-30" aria-hidden />
      <div
        className="relative flex h-[420px] cursor-grab touch-none items-center justify-center select-none active:cursor-grabbing"
        style={{ perspective: 1100 }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={`A forest of ${a.present} green trees for days present and ${a.missed} bare trees for days missed`}
      >
        <div className="relative transition-transform duration-75" style={ground}>
          <div className="absolute -inset-3 rounded-2xl bg-[#6aa84f] shadow-[0_30px_60px_-10px_rgb(0_0_0/0.45)] dark:bg-[#2f5b2a]" style={{ transform: "translateZ(-14px)" }} />
          <div className="absolute -inset-3 rounded-2xl bg-[#8b5a3c] dark:bg-[#4a3022]" style={{ transform: "translateZ(-26px)" }} />
          {a.days.map((d, i) => {
            const x = (i % cols) * tile;
            const y = Math.floor(i / cols) * tile;
            return (
              <div
                key={d.date}
                className={cn(
                  "absolute rounded-md border border-black/5",
                  d.status === "missed" ? "bg-[#b9a27f] dark:bg-[#5d4a35]" : "bg-[#7cc35b] dark:bg-[#3d7a35]",
                  d.status === "pending" && "bg-[#a6d98a] dark:bg-[#4f8f45]",
                )}
                style={{ left: x + 3, top: y + 3, width: tile - 6, height: tile - 6, transformStyle: "preserve-3d" }}
                title={dayLabel(d)}
              >
                <div
                  className="animate-in zoom-in-50 fade-in absolute bottom-1/2 left-1/2 h-[72px] w-[46px] fill-mode-both"
                  style={{ transform: `translateX(-50%) ${upright}`, transformOrigin: "50% 100%", animationDelay: `${i * 35}ms`, animationDuration: "500ms" }}
                >
                  {d.status === "present" ? <GreenTree hue={100 + ((d.day * 37) % 40)} /> : d.status === "missed" ? <BareTree /> : <Sapling />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="absolute top-3 left-3 flex gap-1">
        <Button size="icon-sm" variant="secondary" aria-label="Turn left" onClick={() => setAngle((v) => v - 30)}>
          <RotateCcw aria-hidden />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="Turn right" onClick={() => setAngle((v) => v + 30)}>
          <RotateCw aria-hidden />
        </Button>
      </div>
      <p className="text-muted-foreground absolute bottom-3 left-3 rounded-full bg-white/70 px-2.5 py-1 text-xs dark:bg-black/40">Drag to look around</p>
    </div>
  );
}
