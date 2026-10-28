import { ApiError, messageFor } from "./api/errors";
import { type ApplicantView, type Application, type ApplicationFlag, type ApplicationStatus, type ImageData } from "./api/schemas";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** "₹4,999". */
export const inr = (n: number) => rupees.format(n);

/** What the student is looking at. */
export type ApplyStage = "closed" | "details" | "pay" | "waiting" | "flagged" | "approved" | "rejected";

/** Picks the screen from the server's view. Drafts with details saved go to payment. */
export function stageFor(v: ApplicantView): ApplyStage {
  const a = liveApplication(v);
  if (!a) return v.cohorts.length ? "details" : "closed";
  switch (a.status) {
    case "draft":
      return "pay";
    case "submitted":
      return "waiting";
    case "flagged":
      return "flagged";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
  }
}

/**
 * The application the screen is about. An approved one whose internship has since ended
 * doesn't count: the student can apply again.
 */
export function liveApplication(v: ApplicantView): Application | null {
  const a = v.application;
  return a && a.status === "approved" && !v.enrolled ? null : a;
}

/** Short status label for chips and the admin list. */
export function statusLabel(s: ApplicationStatus): string {
  switch (s) {
    case "draft":
      return "Not paid yet";
    case "submitted":
      return "Awaiting confirmation";
    case "flagged":
      return "Needs the student";
    case "approved":
      return "Enrolled";
    case "rejected":
      return "Closed";
  }
}

/** Admin-facing name of a flag. */
export function flagLabel(f: ApplicationFlag): string {
  switch (f) {
    case "partial_payment":
      return "Partial payment";
    case "cohort_mismatch":
      return "Paid for a different cohort";
    case "cohort_full":
      return "Cohort full";
    case "unclear_proof":
      return "Screenshot unclear";
    case "payment_not_found":
      return "Payment not found";
    case "duplicate_proof":
      return "Screenshot used before";
    case "details_incorrect":
      return "Details need fixing";
    case "other":
      return "Something else";
  }
}

/** The headline a flagged student sees: what's wrong, in their words. */
export function flagHeadline(a: Pick<Application, "flag" | "paid_inr" | "fee_inr" | "due_inr">): string {
  if (!a.flag) return "We need something from you";
  switch (a.flag) {
    case "partial_payment":
      return `We received ${inr(a.paid_inr)} of ${inr(a.fee_inr)}. Pay the remaining ${inr(a.due_inr)}.`;
    case "cohort_mismatch":
      return "Your payment doesn't match this cohort's fee";
    case "cohort_full":
      return "This cohort filled up";
    case "unclear_proof":
      return "We couldn't read your screenshot";
    case "payment_not_found":
      return "We couldn't find this payment";
    case "duplicate_proof":
      return "That screenshot was already used";
    case "details_incorrect":
      return "Some details need fixing";
    case "other":
      return "There's an issue with your application";
  }
}

/** Copy for application errors. Wraps messageFor where the generic copy would mislead. */
export function applyErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "invalid_state":
        return "Your application can't change right now. We refreshed it so you can see where it stands.";
      case "invalid_transition":
        return "This application was already decided. We refreshed it.";
      case "version_conflict":
        return "Your application changed in another tab. We refreshed it.";
      case "payload_too_large":
        return "That screenshot is too big. Use one under 4 MB.";
      default:
        break;
    }
  }
  return messageFor(e);
}

export const PROOF_MAX_BYTES = 4 << 20;
export const QR_MAX_BYTES = 2 << 20;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Checks a picked screenshot before reading it; null when fine. */
export function imageFileError(f: { type: string; size: number }, max: number): string | null {
  if (!IMAGE_TYPES.includes(f.type)) return "Use a PNG, JPG or WebP image.";
  if (f.size > max) return `The image must be under ${Math.round(max / (1 << 20))} MB.`;
  return null;
}

/** Reads a file as plain base64 (no data: prefix). */
export async function fileToBase64(f: Blob): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const imageSrc = (img: ImageData) => `data:${img.content_type};base64,${img.data_base64}`;

/** UPI deep link that opens any UPI app with the payee and amount filled in. */
export function upiLink(upiId: string, payee: string, amount: number, note: string): string {
  const q = new URLSearchParams({ pa: upiId, pn: payee || "Stackstep", am: String(amount), cu: "INR", tn: note.slice(0, 50) });
  return `upi://pay?${q.toString()}`;
}

/** Client-side checks mirroring the server, so the form can stop early. */
export type DetailsDraft = {
  cohort_id: string;
  full_name: string;
  phone: string;
  date_of_birth: string;
  college: string;
  course: string;
  branch: string;
  grad_year: string;
};

export function detailsErrors(d: DetailsDraft, now: Date): Record<string, string> {
  const e: Record<string, string> = {};
  const need = (k: keyof DetailsDraft, label: string) => {
    const n = d[k].trim().length;
    if (n < 2) e[k] = `Enter your ${label}.`;
    else if (n > 120) e[k] = "Keep it under 120 characters.";
  };
  if (!d.cohort_id) e.cohort_id = "Pick a cohort.";
  need("full_name", "full name");
  need("college", "college");
  need("course", "course (e.g. B.Tech)");
  need("branch", "branch (e.g. Computer Science)");
  if (!/^\+?[0-9]{10,15}$/.test(d.phone.replace(/[\s\-()]/g, ""))) e.phone = "Enter a phone number with 10 to 15 digits.";
  if (!d.date_of_birth) e.date_of_birth = "Enter your date of birth.";
  else {
    const age = (now.getTime() - new Date(`${d.date_of_birth}T00:00:00Z`).getTime()) / (365.25 * 86_400_000);
    if (age < 15) e.date_of_birth = "You need to be at least 15.";
    else if (age > 80) e.date_of_birth = "Check the year of your date of birth.";
  }
  const y = now.getUTCFullYear();
  const g = Number(d.grad_year);
  if (!Number.isInteger(g) || g < y - 30 || g > y + 8) e.grad_year = `Pick a year between ${y - 30} and ${y + 8}.`;
  return e;
}

export function proofErrors(utr: string, amount: string, hasImage: boolean, agreed: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!hasImage) e.image = "Attach a screenshot of the payment.";
  if (!/^[A-Za-z0-9]{6,35}$/.test(utr.trim())) e.utr = "Enter the UPI transaction ID (UTR): 6 to 35 letters and digits.";
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1) e.amount_inr = "Enter the amount you paid, in rupees.";
  if (!agreed) e.agree = "Please confirm you've read the refund policy.";
  return e;
}
