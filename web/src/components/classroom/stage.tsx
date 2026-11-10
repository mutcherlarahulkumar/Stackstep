"use client";

import { MonitorUp, Radio } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { type Stroke } from "@/lib/classroom/frames";
import { type Burst } from "@/lib/classroom/state";
import { REACTION_GLYPH } from "@/lib/reactions";
import { cn } from "@/lib/utils";

export type Tool = "pen" | "highlight" | "laser";
export const INK = [
  "#f43f5e",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
] as const;

type Box = { x: number; y: number; w: number; h: number };

/** Where the video's picture sits inside its element (object-contain letterboxing). */
function contentBox(v: { w: number; h: number }, w: number, h: number): Box {
  const vw = v.w || 16;
  const vh = v.h || 9;
  const scale = Math.min(w / vw, h / vh);
  const cw = vw * scale;
  const ch = vh * scale;
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

function paint(
  ctx: CanvasRenderingContext2D,
  box: Box,
  strokes: readonly Stroke[],
  live: Stroke | null,
  laser: { x: number; y: number; at: number } | null,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const draw = (s: Stroke) => {
    if (s.points.length === 0) return;
    ctx.globalAlpha = s.tool === "highlight" ? 0.35 : 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = Math.max(
      1.5,
      s.width * box.w * (s.tool === "highlight" ? 4 : 1),
    );
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.points.forEach(([px, py], i) => {
      const x = box.x + px * box.w;
      const y = box.y + py * box.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (s.points.length === 1)
      ctx.lineTo(
        box.x + (s.points[0]?.[0] ?? 0) * box.w + 0.1,
        box.y + (s.points[0]?.[1] ?? 0) * box.h,
      );
    ctx.stroke();
  };
  strokes.forEach(draw);
  if (live) draw(live);
  if (laser) {
    // laser.at comes from Date.now() in the room reducer, so compare against the same clock.
    const age = (Date.now() - laser.at) / 1200;
    if (age < 1) {
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = "#ef4444";
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(
        box.x + laser.x * box.w,
        box.y + laser.y * box.h,
        7,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * The shared screen with its annotations. Hosts presenting draw on it; everyone sees the
 * same strokes, placed relative to the picture so screen sizes don't matter.
 */
export function Stage({
  stream,
  local,
  strokes,
  laser,
  bursts,
  drawing,
  tool,
  color,
  onStroke,
  onLaser,
  onBurstDone,
  waiting,
}: {
  stream: MediaStream | null;
  local: boolean;
  strokes: readonly Stroke[];
  laser: { x: number; y: number; at: number } | null;
  bursts: readonly Burst[];
  drawing: boolean;
  tool: Tool;
  color: string;
  onStroke: (s: Stroke) => void;
  onLaser: (x: number, y: number) => void;
  onBurstDone: (key: number) => void;
  waiting: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [live, setLive] = useState<Stroke | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const lastLaser = useRef(0);
  const [dims, setDims] = useState({ w: 16, h: 9 });
  const box = contentBox(dims, size.w, size.h);
  const hasVideo = !!stream && stream.getVideoTracks().length > 0;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream)
      v.play().then(
        () => setNeedsTap(false),
        () => setNeedsTap(true),
      );
  }, [stream]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    paint(ctx, contentBox(dims, size.w, size.h), strokes, live, laser);
  }, [dims, size, strokes, live, laser]);

  useEffect(() => {
    redraw();
    if (!laser) return;
    // Let the laser dot fade out.
    let raf = 0;
    const tick = () => {
      redraw();
      if (Date.now() - laser.at < 1200)
        raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [redraw, laser]);

  const point = (e: ReactPointerEvent): [number, number] | null => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || box.w === 0) return null;
    const x = (e.clientX - r.left - box.x) / box.w;
    const y = (e.clientY - r.top - box.y) / box.h;
    return x < 0 || x > 1 || y < 0 || y > 1
      ? null
      : [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
  };

  const down = (e: ReactPointerEvent) => {
    if (!drawing) return;
    const p = point(e);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    if (tool === "laser") return onLaser(p[0], p[1]);
    setLive({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      tool,
      color,
      width: 0.004,
      points: [p],
    });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drawing) return;
    const p = point(e);
    if (!p) return;
    if (tool === "laser") {
      if (e.buttons === 0 && e.pointerType === "mouse") return;
      const now = performance.now();
      if (now - lastLaser.current > 35) {
        lastLaser.current = now;
        onLaser(p[0], p[1]);
      }
      return;
    }
    setLive((s) =>
      s && s.points.length < 400 ? { ...s, points: [...s.points, p] } : s,
    );
  };
  const up = () => {
    if (live) onStroke(live);
    setLive(null);
  };

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return (
    <div
      ref={wrap}
      className="relative h-full min-h-0 w-full overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/10"
      data-testid="class-stage"
    >
      <video
        ref={video}
        onLoadedMetadata={(e) =>
          setDims({
            w: e.currentTarget.videoWidth,
            h: e.currentTarget.videoHeight,
          })
        }
        onResize={(e) =>
          setDims({
            w: e.currentTarget.videoWidth,
            h: e.currentTarget.videoHeight,
          })
        }
        className={cn(
          "absolute inset-0 h-full w-full object-contain",
          !hasVideo && "opacity-0",
        )}
        playsInline
        autoPlay
        muted={local}
        aria-label="Shared screen"
      />
      {!hasVideo ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-zinc-300">
          <div className="flex flex-col items-center gap-3">
            <span className="relative grid size-16 place-items-center rounded-full bg-white/5">
              <span
                className="bg-primary/30 absolute inset-0 animate-ping rounded-full"
                aria-hidden
              />
              {local ? (
                <MonitorUp className="size-7" aria-hidden />
              ) : (
                <Radio className="size-7" aria-hidden />
              )}
            </span>
            <p className="max-w-sm text-sm">{waiting}</p>
          </div>
        </div>
      ) : null}
      <canvas
        ref={canvas}
        width={Math.max(1, size.w * dpr)}
        height={Math.max(1, size.h * dpr)}
        style={{ width: size.w, height: size.h }}
        className={cn(
          "absolute inset-0 touch-none",
          drawing
            ? tool === "laser"
              ? "cursor-pointer"
              : "cursor-crosshair"
            : "pointer-events-none",
        )}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-hidden
      />
      {needsTap ? (
        <button
          type="button"
          onClick={() =>
            void video.current?.play().then(() => setNeedsTap(false))
          }
          className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow"
        >
          Tap to hear the class
        </button>
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-live="polite"
      >
        {bursts.map((b) => (
          <span
            key={b.key}
            className="animate-float-up absolute bottom-6 flex flex-col items-center text-3xl"
            style={{ left: `${b.left}%` }}
            onAnimationEnd={() => onBurstDone(b.key)}
          >
            {REACTION_GLYPH[b.emoji as keyof typeof REACTION_GLYPH].glyph}
            <span className="mt-0.5 rounded-full bg-black/50 px-1.5 text-[10px] text-white">
              {b.name}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
