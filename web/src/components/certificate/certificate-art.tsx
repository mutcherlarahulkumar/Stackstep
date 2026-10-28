"use client";

import QRCode from "qrcode";
import { forwardRef, useMemo } from "react";

import { type Certificate } from "@/lib/api/schemas";
import { certificateWording, dateOnlyLabel, formatCode, verifyPath } from "@/lib/certificate";

/** A4 landscape at 96 dpi; prints edge to edge and exports crisp at 2x. */
export const ART_WIDTH = 1123;
export const ART_HEIGHT = 794;

const INK = "#1c1433";
const VIOLET = "#5b21b6";
const GOLD = "#b08532";
const GOLD_LIGHT = "#e7cf8f";
const PAPER = "#fffdf7";
const MUTED = "#6b6478";
// System fonts only, so the PNG export (drawn through a canvas) looks exactly like the page.
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Breaks text into lines of at most `max` characters, on word boundaries. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** The QR code as one SVG path (1 unit per module). */
function qrPath(text: string): { d: string; size: number } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { d, size };
}

/** A small L-shaped flourish for each corner of the inner frame. */
function Corner({ x, y, sx, sy }: { x: number; y: number; sx: 1 | -1; sy: 1 | -1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`} fill="none" stroke={GOLD}>
      <path d="M0 64 V12 Q0 0 12 0 H64" strokeWidth={2.5} />
      <path d="M10 46 V20 Q10 10 20 10 H46" strokeWidth={1} />
      <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill={GOLD} stroke="none" />
    </g>
  );
}

/** The gold seal: two rings, the name around the edge, a star in the middle, two ribbons. */
function Seal({ cx, cy }: { cx: number; cy: number }) {
  const r = 58;
  return (
    <g>
      <path d={`M${cx - 24} ${cy + 44} l-12 40 l16 -9 l11 14 l8 -40 z`} fill={VIOLET} opacity={0.9} />
      <path d={`M${cx + 24} ${cy + 44} l12 40 l-16 -9 l-11 14 l-8 -40 z`} fill={VIOLET} opacity={0.75} />
      <circle cx={cx} cy={cy} r={r + 8} fill={GOLD} />
      <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke={GOLD_LIGHT} strokeWidth={1.5} strokeDasharray="2 3" />
      <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke={GOLD_LIGHT} strokeWidth={1.2} />
      <defs>
        <path id="seal-ring" d={`M ${cx} ${cy} m -${r - 4} 0 a ${r - 4} ${r - 4} 0 1 1 ${2 * (r - 4)} 0 a ${r - 4} ${r - 4} 0 1 1 -${2 * (r - 4)} 0`} />
      </defs>
      <text fontFamily={SANS} fontSize={9.5} fontWeight={700} letterSpacing={1.5} fill="#fff8e6">
        <textPath href="#seal-ring" startOffset="0">
          STACKSTEP • VIRTUAL INTERNSHIP • VERIFIED •
        </textPath>
      </text>
      <path d={`M${cx} ${cy - 22} l6.5 13.2 14.5 2.1 -10.5 10.2 2.5 14.5 -13 -6.8 -13 6.8 2.5 -14.5 -10.5 -10.2 14.5 -2.1z`} fill="#fff8e6" />
    </g>
  );
}

/** The Stackstep mark: three rising bars in a rounded square (as in the app's logo). */
function Mark({ x, y, size }: { x: number; y: number; size: number }) {
  const u = size / 32;
  return (
    <g transform={`translate(${x} ${y}) scale(${u})`}>
      <rect width={32} height={32} rx={8} fill={VIOLET} />
      <rect x={7} y={17} width={4.5} height={8} rx={1.5} fill="#fff" />
      <rect x={13.75} y={12} width={4.5} height={13} rx={1.5} fill="#fff" />
      <rect x={20.5} y={7} width={4.5} height={18} rx={1.5} fill="#fff" />
    </g>
  );
}

/**
 * The designed certificate as one self-contained SVG: no web fonts, no external images, so it
 * prints, downloads as SVG and converts to PNG exactly as shown.
 */
export const CertificateArt = forwardRef<SVGSVGElement, { cert: Certificate; origin: string }>(function CertificateArt({ cert, origin }, ref) {
  const url = `${origin}${verifyPath(cert.code)}`;
  const qr = useMemo(() => qrPath(url), [url]);
  const w = certificateWording(cert);
  const body = wrap(w.body, 86);
  const closing = wrap(w.closing, 92);
  const revoked = cert.status === "revoked";
  const cx = ART_WIDTH / 2;
  const qrBox = 86;
  const bodyTop = 448;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}
      width={ART_WIDTH}
      height={ART_HEIGHT}
      role="img"
      aria-labelledby="cert-title cert-desc"
      className="h-auto w-full"
      data-testid="certificate-art"
    >
      <title id="cert-title">{`Certificate of Internship Completion for ${cert.student_name}`}</title>
      <desc id="cert-desc">{`${w.body} ${w.closing} Issued ${dateOnlyLabel(w.issued)}. Certificate ID ${formatCode(cert.code)}.`}</desc>

      {/* Paper, outer band and inner frame */}
      <rect width={ART_WIDTH} height={ART_HEIGHT} fill={PAPER} />
      <rect x={14} y={14} width={ART_WIDTH - 28} height={ART_HEIGHT - 28} fill="none" stroke={VIOLET} strokeWidth={10} />
      <rect x={30} y={30} width={ART_WIDTH - 60} height={ART_HEIGHT - 60} fill="none" stroke={GOLD} strokeWidth={1.5} />
      <rect x={38} y={38} width={ART_WIDTH - 76} height={ART_HEIGHT - 76} fill="none" stroke={GOLD_LIGHT} strokeWidth={1} />
      <Corner x={52} y={52} sx={1} sy={1} />
      <Corner x={ART_WIDTH - 52} y={52} sx={-1} sy={1} />
      <Corner x={52} y={ART_HEIGHT - 52} sx={1} sy={-1} />
      <Corner x={ART_WIDTH - 52} y={ART_HEIGHT - 52} sx={-1} sy={-1} />

      {/* Brand */}
      <Mark x={cx - 92} y={78} size={34} />
      <text x={cx - 48} y={102} fontFamily={SANS} fontSize={22} fontWeight={700} letterSpacing={6} fill={INK}>
        STACKSTEP
      </text>

      {/* Title */}
      <text x={cx} y={196} textAnchor="middle" fontFamily={SERIF} fontSize={68} letterSpacing={10} fill={INK}>
        CERTIFICATE
      </text>
      <line x1={cx - 250} y1={232} x2={cx - 180} y2={232} stroke={GOLD} strokeWidth={1.5} />
      <line x1={cx + 180} y1={232} x2={cx + 250} y2={232} stroke={GOLD} strokeWidth={1.5} />
      <text x={cx} y={238} textAnchor="middle" fontFamily={SANS} fontSize={16} fontWeight={600} letterSpacing={5} fill={GOLD}>
        OF INTERNSHIP COMPLETION
      </text>

      {/* Recipient */}
      <text x={cx} y={296} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={20} fill={MUTED}>
        This is to certify that
      </text>
      <text x={cx} y={372} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={cert.student_name.length > 28 ? 44 : 56} fill={VIOLET}>
        {cert.student_name}
      </text>
      <line x1={cx - 270} y1={394} x2={cx + 270} y2={394} stroke={GOLD} strokeWidth={1.2} />

      {/* What they did */}
      <text textAnchor="middle" fontFamily={SERIF} fontSize={19} fill={INK}>
        {body.map((l, i) => (
          <tspan key={`b${i}`} x={cx} y={bodyTop + i * 29}>
            {l}
          </tspan>
        ))}
        {closing.map((l, i) => (
          <tspan key={`c${i}`} x={cx} y={bodyTop + (body.length + i) * 29 + 6} fill={MUTED} fontStyle="italic" fontSize={17}>
            {l}
          </tspan>
        ))}
      </text>

      {/* Date, seal, signature */}
      <g fontFamily={SANS} textAnchor="middle">
        <text x={250} y={650} fontFamily={SERIF} fontSize={20} fill={INK}>
          {dateOnlyLabel(w.issued)}
        </text>
        <line x1={150} y1={664} x2={350} y2={664} stroke={INK} strokeWidth={1} />
        <text x={250} y={686} fontSize={12} letterSpacing={2} fill={MUTED}>
          DATE OF ISSUE
        </text>

        <text x={ART_WIDTH - 250} y={650} fontFamily={SERIF} fontStyle="italic" fontSize={24} fill={VIOLET}>
          Stackstep Mentor Team
        </text>
        <line x1={ART_WIDTH - 350} y1={664} x2={ART_WIDTH - 150} y2={664} stroke={INK} strokeWidth={1} />
        <text x={ART_WIDTH - 250} y={686} fontSize={12} letterSpacing={2} fill={MUTED}>
          AUTHORISED SIGNATORY
        </text>
      </g>
      <Seal cx={cx} cy={618} />

      {/* Verification: QR in the top-right corner, the ID and address along the bottom */}
      <g transform={`translate(${ART_WIDTH - 82 - qrBox} 72)`}>
        <rect x={-6} y={-6} width={qrBox + 12} height={qrBox + 12} fill="#fff" stroke={GOLD_LIGHT} />
        <path d={qr.d} transform={`scale(${qrBox / qr.size})`} fill={INK} shapeRendering="crispEdges" />
        <text x={qrBox / 2} y={qrBox + 22} textAnchor="middle" fontFamily={SANS} fontSize={10} letterSpacing={1.5} fill={MUTED}>
          SCAN TO VERIFY
        </text>
      </g>
      <text x={cx} y={ART_HEIGHT - 54} textAnchor="middle" fontFamily={SANS} fontSize={12} fill={MUTED}>
        {`Certificate ID ${formatCode(cert.code)}  ·  Verify at ${url.replace(/^https?:\/\//, "")}`}
      </text>

      {revoked ? (
        <g transform={`rotate(-18 ${cx} ${ART_HEIGHT / 2})`} opacity={0.78}>
          <rect x={cx - 230} y={ART_HEIGHT / 2 - 58} width={460} height={116} rx={14} fill="none" stroke="#dc2626" strokeWidth={8} />
          <text x={cx} y={ART_HEIGHT / 2 + 30} textAnchor="middle" fontFamily={SANS} fontSize={84} fontWeight={800} letterSpacing={12} fill="#dc2626">
            REVOKED
          </text>
        </g>
      ) : null}
    </svg>
  );
});
