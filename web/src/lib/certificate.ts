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
