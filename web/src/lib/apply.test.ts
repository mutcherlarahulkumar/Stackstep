import { describe, expect, it } from "vitest";

import { ApiError } from "./api/errors";
import { type ApplicantView } from "./api/schemas";
import { applyErrorMessage, detailsErrors, fileToBase64, flagHeadline, imageFileError, inr, proofErrors, stageFor, upiLink } from "./apply";

const now = new Date("2026-10-28T10:00:00Z");
const good = {
  cohort_id: "c",
  full_name: "Nora Fernandes",
  phone: "+91 98765 43210",
  date_of_birth: "2004-05-17",
  college: "ANITS",
  course: "B.Tech",
  branch: "CSE",
  grad_year: "2027",
};

describe("apply stages", () => {
  const base = { application: null, cohort: null, proofs: [], messages: [], cohorts: [], enrolled: false } as unknown as ApplicantView;
  it("closed without open cohorts, details with them", () => {
    expect(stageFor(base)).toBe("closed");
    expect(stageFor({ ...base, cohorts: [{}] } as unknown as ApplicantView)).toBe("details");
  });
  it("follows the status", () => {
    const at = (status: string) => stageFor({ ...base, application: { status } } as unknown as ApplicantView);
    expect([at("draft"), at("submitted"), at("flagged"), at("rejected")]).toEqual(["pay", "waiting", "flagged", "rejected"]);
    expect(stageFor({ ...base, enrolled: true, application: { status: "approved" } } as unknown as ApplicantView)).toBe("approved");
  });
  it("lets a student whose internship ended apply again", () => {
    expect(stageFor({ ...base, cohorts: [{}], application: { status: "approved" } } as unknown as ApplicantView)).toBe("details");
  });
});

describe("apply copy", () => {
  it("formats rupees the Indian way", () => {
    expect(inr(4999)).toBe("₹4,999");
    expect(inr(150000)).toBe("₹1,50,000");
  });
  it("spells out a partial payment", () => {
    expect(flagHeadline({ flag: "partial_payment", paid_inr: 2000, fee_inr: 4999, due_inr: 2999 })).toBe("We received ₹2,000 of ₹4,999. Pay the remaining ₹2,999.");
  });
  it("never says 'sign-in link expired' for an application", () => {
    expect(applyErrorMessage(new ApiError(400, "invalid_state", "x"))).toMatch(/can't change right now/);
  });
  it("builds a UPI link with the amount", () => {
    expect(upiLink("stackstep@okaxis", "Stackstep", 4999, "Frontend")).toBe("upi://pay?pa=stackstep%40okaxis&pn=Stackstep&am=4999&cu=INR&tn=Frontend");
  });
});

describe("apply checks", () => {
  it("accepts good details", () => {
    expect(detailsErrors(good, now)).toEqual({});
  });
  it("flags each bad field", () => {
    const e = detailsErrors({ ...good, cohort_id: "", phone: "123", date_of_birth: "2020-01-01", grad_year: "1900", full_name: " " }, now);
    expect(Object.keys(e).sort()).toEqual(["cohort_id", "date_of_birth", "full_name", "grad_year", "phone"]);
  });
  it("needs the screenshot, UTR, amount and the refund policy tick", () => {
    expect(Object.keys(proofErrors("ab", "0", false, false)).sort()).toEqual(["agree", "amount_inr", "image", "utr"]);
    expect(proofErrors("UTR123456789", "4999", true, true)).toEqual({});
  });
  it("checks image type and size", () => {
    expect(imageFileError({ type: "image/gif", size: 10 }, 100)).toMatch(/PNG/);
    expect(imageFileError({ type: "image/png", size: 5 << 20 }, 4 << 20)).toMatch(/4 MB/);
    expect(imageFileError({ type: "image/webp", size: 10 }, 100)).toBeNull();
  });
  it("reads files as base64", async () => {
    expect(await fileToBase64(new Blob(["hi"]))).toBe("aGk=");
  });
});
