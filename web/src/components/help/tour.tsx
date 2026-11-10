"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

export type TourStep = {
  /** The `data-tour` value of the element to spotlight. Missing (say, on a phone) means a centred card. */
  target?: string;
  title: string;
  body: string;
};

// One tour at a time, shared across the page: menus start it, the host on the page shows it.
let active = false;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function startTour() {
  active = true;
  emit();
}
function stopTour() {
  active = false;
  emit();
}

/** Whether this page has a tour to start (the account menu and help panel offer it then). */
export function useTourAvailable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hosts > 0,
    () => false,
  );
}

const useActive = () =>
  useSyncExternalStore(
    subscribe,
    () => active,
    () => false,
  );

type Rect = { top: number; left: number; width: number; height: number };

function findTarget(target?: string): HTMLElement | null {
  if (!target) return null;
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Mount once per page with that page's steps. It renders nothing until a tour starts. */
export function TourHost({ steps }: { steps: TourStep[] }) {
  const on = useActive();
  useEffect(() => {
    hosts++;
    emit();
    return () => {
      hosts--;
      if (hosts === 0) active = false;
      emit();
    };
  }, []);
  if (!on || steps.length === 0) return null;
  return createPortal(<Tour steps={steps} onClose={stopTour} />, document.body);
}

function Tour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[i] ?? steps[0];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step?.target]);

  useLayoutEffect(() => {
    const el = findTarget(step?.target);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const raf = requestAnimationFrame(measure);
    card.current?.focus();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, step?.target]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, steps.length]);

  if (!step) return null;
  const pad = 6;
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  // Below the target if there is room, else above, else centred.
  let pos: { top: number; left: number } = { top: vh / 2 - 110, left: vw / 2 - cardW / 2 };
  if (rect) {
    const below = rect.top + rect.height + pad + 12;
    const above = rect.top - pad - 12 - 200;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16);
    if (below + 200 < vh) pos = { top: below, left };
    else if (above > 16) pos = { top: above, left };
    else pos = { top: Math.max(16, vh - 240), left };
  }

  return (
    <div className="fixed inset-0 z-[100]" data-testid="tour">
      {/* The dim with a hole around the target; clicking it closes the tour. */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden>
        {rect ? (
          <div
            className="absolute rounded-xl ring-2 ring-white/80 transition-all duration-300 ease-out"
            style={{
              top: rect.top - pad,
              left: rect.left - pad,
              width: rect.width + pad * 2,
              height: rect.height + pad * 2,
              boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.6)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/60" />
        )}
      </div>
      <div
        ref={card}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="bg-popover text-popover-foreground animate-in fade-in zoom-in-95 absolute flex flex-col gap-3 rounded-2xl p-5 shadow-2xl ring-1 ring-black/10 outline-none transition-[top,left] duration-300"
        style={{ top: pos.top, left: pos.left, width: cardW }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-primary text-xs font-semibold">
              {i + 1} of {steps.length}
            </p>
            <h2 id="tour-title" className="mt-0.5 text-lg font-semibold">
              {step.title}
            </h2>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="End the tour" onClick={onClose} data-testid="tour-close">
            <X aria-hidden />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
        <div className="flex items-center gap-1">
          {steps.map((s, n) => (
            <span key={s.title} className={n === i ? "bg-primary h-1.5 w-5 rounded-full" : "bg-muted-foreground/30 size-1.5 rounded-full"} aria-hidden />
          ))}
          <div className="ml-auto flex gap-2">
            {i > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setI(i - 1)} aria-label="Back">
                <ArrowLeft aria-hidden />
              </Button>
            ) : null}
            <Button size="sm" onClick={() => (last ? onClose() : setI(i + 1))} data-testid="tour-next">
              {last ? "Finish" : "Next"} {last ? null : <ArrowRight data-icon="inline-end" aria-hidden />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
