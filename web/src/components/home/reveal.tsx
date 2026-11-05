"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Fades its children up the first time they scroll into view. Order with `i` for a cascade. */
export function Reveal({ children, className, i = 0, as: Tag = "div" }: { children: ReactNode; className?: string; i?: number; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.shown = "";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.dataset.shown = "";
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={(n: HTMLElement | null) => {
        ref.current = n;
      }}
      data-reveal=""
      style={{ ["--i" as string]: i } as CSSProperties}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
