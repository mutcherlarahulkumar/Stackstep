# A contact form that tells the truth

**Estimated effort:** 90 minutes. **Prerequisite:** controlled inputs and derived state. The demo must clearly say that it sends no real email.

## Core work
1. Provide explicit labels for name, email and message. Define limits: name 1–80 characters, email up to 254 characters with a reasonable email input check, message 10–2,000 characters after trimming.
2. Validate on submit, show field-specific errors and associate them with the inputs.
3. Move focus to the first invalid field after submission; preserve entered values.
4. Simulate a deterministic success and failure through a local function. Disable duplicate submission while pending and let failed submissions retry.
5. Verify the entire form using a keyboard and at 360px.

```jsx
<label htmlFor="contact-email">Email</label>
<input id="contact-email" name="email" type="email"
  aria-invalid={Boolean(emailError)}
  aria-describedby={emailError ? "email-error" : undefined} />
```

## Done checks
Blank and overlong inputs produce useful errors. Error styling is not the only signal. A failed submission does not erase the message. The success message states “Demo complete; no email was sent,” not “Your message was delivered.”

## Debugging prompt
If focus disappears after an error, check whether the input was remounted or a conditional branch replaced the form. Avoid logging the visitor's message or email.

## Hand-in and reflection
Submit the PR with invalid, pending, failure and success evidence. Ask a reviewer to attempt submission without using a mouse.

**Optional stretch:** test paste and autofill. Do not add an external mail integration to finish this task.
