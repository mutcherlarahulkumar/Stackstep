# Keep untrusted content separate from executable code

**Estimated effort:** 90 minutes. **Prerequisite:** product data validation and recoverable writes. This task demonstrates session states; it does not implement a secure authentication service.

## Core work
1. Audit where product titles, user input and URL parameters reach the DOM. Render plain text through the framework; do not inject arbitrary HTML.
2. Add explicit fixture states for signed-out, expired-session and forbidden responses. Label them as simulations and give each a useful next action.
3. Ensure a failed request cannot appear as a successful save.
4. Inspect committed files, browser storage and diagnostic logs for credentials. Never put a real token into the fixture adapter or frontend bundle.
5. Test a title that looks like HTML and an invalid category parameter.

```text
Product title: <img src=x onerror=alert(1)>
Expected: visible text or safely rejected data, never executable markup
```

## Done checks
Untrusted text does not execute. The demo does not claim client-side role checks are backend security. A forbidden state does not invite endless retries; an expired demo session explains its recovery path. No raw secret is logged or committed.

## Hand-in and feedback
Submit the audit checklist, PR and evidence for the three session states. Ask a reviewer to trace a hostile title from fixture data to rendering.

**Retrieval:** which validation belongs at the data boundary and which authorization must happen on a real server? **Optional stretch:** document the server-side contract you would require before connecting real authentication; no external key is needed today.
