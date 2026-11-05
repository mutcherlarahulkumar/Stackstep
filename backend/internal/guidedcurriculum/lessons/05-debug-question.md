# Ask for help with a reproducible question

**Estimated effort:** 30 minutes. **Prerequisite:** any real unexpected result from your portfolio.

## Why it matters
A good question reduces the time between being stuck and learning. “It doesn't work” forces someone else to reconstruct your entire situation.

## Core work
Choose one blocker and write:
1. **Goal:** the behaviour you wanted.
2. **Expected and actual:** one concrete input, action or viewport and both outcomes.
3. **Small example:** the minimum code/data needed to reproduce it.
4. **Experiments:** two things you tried and what each result ruled out.
5. **Question:** the specific uncertainty that remains.

```text
At 360px I expect the hero links to wrap onto two rows.
Instead the page scrolls sideways after I add a long link label.
Removing flex-wrap changes ..., but reducing gap changes ...
Which item's minimum width is preventing wrapping?
```

## Done checks
A peer can follow the steps without your full private repository. The question does not include secrets or unnecessary personal details. You have separated the observed symptom from your proposed explanation.

## Try the question
Read it aloud or give it to a reviewer. Note where they need more context and revise that part. If you solve the blocker while minimizing it, record the cause and the experiment that revealed it; this is a successful outcome.

## Hand-in and reflection
Save the question and a short resolution in your task note. Ask for feedback on reproducibility, not merely the final fix. Later, use the same structure in a bug report.

**Optional stretch:** remove another irrelevant part of the reproduction while keeping the failure visible.
