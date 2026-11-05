# Build a hero that communicates and works

**Estimated effort:** 90 minutes. **Prerequisite:** your portfolio repo and first PR. **Artifact:** `feat/hero` PR with narrow-screen and keyboard evidence.

## Core work
1. In the portfolio repository, create `index.html` and `styles.css`; link the stylesheet with `<link rel="stylesheet" href="styles.css">` in the document head. Open `index.html` in your browser. This stage is plain HTML/CSS; React starts on day 8 and no package installation is needed.
2. Use semantic HTML: a main region, one primary heading for your name, role, short honest bio, and meaningful links to your work.
3. Start with a single-column layout. Constrain readable text width and allow content to wrap.
4. Choose visible link text such as “View my projects,” not several indistinguishable “click here” labels.
5. For links opening a new tab, use `rel="noopener noreferrer"` and make that behaviour clear. Do not turn ordinary navigation into buttons.
6. Use browser developer tools to set a 360px responsive viewport. Check the layout at 360px and a wide viewport. Walk every interactive element using Tab and Shift+Tab.

```html
<main>
  <section aria-labelledby="intro-title">
    <h1 id="intro-title">Your name</h1>
    <p>What you build and who it helps.</p>
    <a href="https://github.com/your-login" target="_blank"
       rel="noopener noreferrer">GitHub profile (opens a new tab)</a>
  </section>
</main>
```

## Done checks
No horizontal page scrolling at 360px. Heading order is meaningful, text remains readable at 200% zoom, and keyboard focus is clearly visible. Every link has a real destination; placeholder destinations are labelled unfinished rather than disguised as working features.

## Diagnose and reflect
If text overflows, inspect its container and intrinsic width before adding `overflow: hidden`. Test an unusually long name. Submit the PR and two screenshots; explain one layout choice and ask for feedback on readability.

**Optional stretch:** support reduced motion if you add animation. Animation is not required for a good hero.
