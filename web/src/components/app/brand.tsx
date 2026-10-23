import { useId } from "react";

import { cn } from "@/lib/utils";

/** Three rising steps — the Stackstep mark (same drawing as the Flutter BrandMark). */
export function BrandMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Stackstep" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="color-mix(in oklch, var(--primary), #f59e0b 30%)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <rect x="6.5" y="18.5" width="4.5" height="7" rx="1" fill="#fff" fillOpacity="0.7" />
      <rect x="13.75" y="13" width="4.5" height="12.5" rx="1" fill="#fff" fillOpacity="0.85" />
      <rect x="21" y="6.5" width="4.5" height="19" rx="1" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <BrandMark />
      Stackstep
    </span>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4 fill-current", className)}>
      <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.74 18.27.5 12 .5Z" />
    </svg>
  );
}
