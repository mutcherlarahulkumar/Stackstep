import { type Certificate } from "./api/schemas";

/** Certificate codes use 12 characters without look-alikes (no 0, 1, I, L, O). */
export const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{12}$/;

/** Uppercases a typed code and drops spaces and dashes (same rule as the server). */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");

export const isCode = (raw: string) => CODE_PATTERN.test(normalizeCode(raw));

/** "ABCD-EFGH-JK23", easier to read aloud and type from paper. */
export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join("-") ?? code;

export const verifyPath = (code: string) => `/verify/${encodeURIComponent(code)}`;
export const certificatePath = (code: string) => `/certificate/${encodeURIComponent(code)}`;

const longDate = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Formats a YYYY-MM-DD date without shifting it into the viewer's zone. */
export const dateOnlyLabel = (d: string) => longDate.format(new Date(`${d}T00:00:00Z`));

export function programLabel(c: Pick<Certificate, "program_days" | "program_slug">): string {
  const track = c.program_slug.includes("fullstack") ? "Full-stack" : c.program_slug.includes("frontend") ? "Frontend" : "Software";
  return `${c.program_days}-day ${track} Engineering Internship`;
}

/** The last day the certificate covers: the internship's end, or the issue date if earlier. */
export function periodEnd(c: Pick<Certificate, "end_date" | "issued_at">): string {
  const issued = c.issued_at.toISOString().slice(0, 10);
  return issued < c.end_date ? issued : c.end_date;
}

/** The track a flow teaches: "React Frontend · 30 days" → "React Frontend". */
export function trackName(flow: string | null): string | null {
  const t = flow?.replace(/\s*·\s*\d+\s*days?\s*$/i, "").trim();
  return t ? t : null;
}

/**
 * The certificate's words, in the usual internship-certificate form: who, what, when, and a
 * line on conduct. No task counts or points; those live on the verification page.
 */
export function certificateWording(c: Pick<Certificate, "student_name" | "program_days" | "program_slug" | "flow_name" | "start_date" | "end_date" | "issued_at">) {
  const first = c.student_name.trim().split(/\s+/)[0] ?? c.student_name;
  const track = trackName(c.flow_name);
  return {
    body: `has successfully completed the ${programLabel(c)}${track ? ` in ${track}` : ""} at Stackstep, from ${dateOnlyLabel(c.start_date)} to ${dateOnlyLabel(periodEnd(c))}.`,
    closing: `During the internship, ${first} showed dedication, professionalism and a keen willingness to learn. We wish them every success in the future.`,
    issued: c.issued_at.toISOString().slice(0, 10),
  };
}
