# Feature 05 — Progress, certificates and public verification

## Progress

`GET /v1/me/progress` (students) and `GET /v1/admin/enrollments/{id}/progress` (staff in
scope) return, for tasks the student can see: released, done, in review, overdue, done on
time, points, the internship day, `completion_percent` (done ÷ released) and whether the
suggested certificate bar (**70%**) is met.

## Certificates

- **Issued by hand.** Staff in scope press *Issue certificate*. The bar is shown as guidance;
  the decision is theirs. No AI is involved.
- **A snapshot.** Name, GitHub login, program, flow, dates, points and tasks done/released are
  copied at issue time, so later edits never change an issued certificate.
- **One valid certificate per internship.** Issuing again is refused until the current one is
  revoked. Revoking (platform admins only) needs a reason, which the verify page shows.
- **Unguessable code.** 12 characters from an alphabet without look-alikes (no 0/O/1/I/L),
  about 59 bits, generated without modulo bias.
- **The team lead congratulates the student** in chat with the code.
- **Public verification.** `GET /v1/certificates/{code}` needs no sign-in, is rate limited
  like sign-in, and answers `valid` or `revoked`. The web app serves `/verify/{code}` and a
  designed `/certificate/{code}`.
- **Certificate artwork.** A4 landscape in the usual internship-certificate form: "Certificate
  of Internship Completion", "This is to certify that", the name, the program and dates, a line
  on conduct, the issue date, an authorised-signatory line, a seal, the certificate ID and a QR
  code to the verification page. It never lists tasks or points (those stay on `/verify`).
  Drawn as one self-contained SVG with system fonts, so **Print or save PDF**, **Download PNG**
  (2×) and **Download SVG** all match the page. Revoked certificates show REVOKED across it and
  offer no downloads.

## Edge cases

| # | Case | Expected | Test |
|---|---|---|---|
| CE1 | Progress before and after finishing tasks | counts only released, non-cancelled tasks; bar at 70% | backend `TestCertificates`, domain `TestCertificateCode` |
| CE2 | Issue twice | second is refused (422) until the first is revoked | backend `TestCertificates` |
| CE3 | Verify without signing in; junk or unknown code | 200 / 404 | backend `TestCertificates` |
| CE4 | College admin revokes; blank reason; revoke twice | 403 / 422 / 422; verify shows *revoked* with the reason; a new certificate gets a new code | backend `TestCertificates` |
| CE5 | Issue for a student outside scope, or as a student | 404 / 403 | backend `TestCertificates` |
| CE6 | Codes | valid alphabet, no repeats in 2000 draws | domain `TestCertificateCode` |
| CE7 | Codes typed in lower case or with dashes/spaces | normalized (server and web); junk input is refused on `/verify` before a lookup | backend `TestNormalizeCertificateCode`, web `certificate.test.ts`, E2E `certificates.spec.ts` |
| CE8 | Student before / after issue | progress panel explains the bar and who issues it; afterwards shows the code and links | Flutter `progress_test.dart`, E2E `certificates.spec.ts` |
| CE9 | Issue below the bar | dialog warns, admin may still issue | E2E `certificates.spec.ts` |
| CE10 | Revoked certificate page | verify shows *revoked* with reason; printable page shows a REVOKED stamp and printing is disabled | E2E `certificates.spec.ts` |
| CE11 | Unknown code; offline | "No certificate with this code" / retryable error state | E2E `certificates.spec.ts` |
| CE12 | Certificate wording | internship-certificate form; names the program, track and dates; never mentions tasks or points | web `certificate.test.ts`, E2E `certificates.spec.ts` |
| CE13 | Download PNG / SVG, print | PNG at 2× named `stackstep-certificate-XXXX-XXXX-XXXX.png`; SVG and A4 landscape print match the page; none offered when revoked | E2E `certificates.spec.ts` |

## Surfaces

- **Web, student:** the award button in the header opens *Your progress* (tasks finished
  against the bar, in review, overdue, on time, points, certificate links).
- **Web, staff:** the student detail shows `% done · done/released` beside the wallet, with
  *Issue certificate*, the code (opens the verify page) and *Revoke* (platform admins).
- **Web, public:** `/verify` (type a code), `/verify/{code}`, `/certificate/{code}`
  (print or save as PDF). No sign-in, `noindex`.
- **App:** the award button on the student shell opens *Your progress*; the certificate opens
  the web verify page (`WEB_BASE_URL` dart-define) and the link can be copied.
