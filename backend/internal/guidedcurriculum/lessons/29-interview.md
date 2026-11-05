# Explain decisions, then use questions to find gaps

**Estimated effort:** 60 minutes. **Prerequisite:** the capstone can run through its primary journey and your earlier algorithm notes are available for checking afterward. **Artifact:** a short walkthrough, one fresh problem attempt and an honest gap log. No recording account or interview partner is required.

**Problem:** a polished script can hide a weak mental model. Practise explaining the why, then change an assumption and see whether the explanation still holds.

## Core work: Give an eight-minute walkthrough · 15 minutes

Without reading your case-study draft, explain the user problem, demonstrate the main journey, trace one action through UI/state/adapter and describe one failure path. For Study Queue: what changes immediately when Save is pressed, and what changes only after storage confirms success?

An available person can listen and ask questions. Working alone, record locally if convenient or write timestamped notes after speaking aloud. Label the exercise self-practice; do not claim external feedback or a successful real interview. A recording is optional.

## Answer three follow-ups · 15 minutes

Pick three, pausing to reason instead of guessing:

- What breaks if two saves finish in the opposite order?
- Why did you keep filtered results out of state?
- What happens to keyboard focus when an item disappears?
- What changes if storage throws or contains malformed JSON?
- Which test would fail if your last bug returned?
- What evidence would justify a backend rather than local storage?

For each answer, state your assumption, give an example and identify any uncertainty. “I have not implemented that; here is how I would test it” is stronger than pretending a guarantee exists.

## Retrieve one earlier problem · 20 minutes

Choose Two Sum, balanced brackets, binary search insertion or interval merging. Set a 12-minute timer, close the solution and write the contract, two edge cases and an approach. Implement or trace it in your existing JavaScript runner. Use the remaining time to compare with earlier notes and correct one specific error. Do not paste an old solution and count it as retrieval.

## Close the gap · 10 minutes

Write `docs/capstone/explanation-practice.md` with what you attempted, where your explanation broke, one corrected explanation and one targeted practice step. Post the useful summary in your task note; a small docs commit is optional for this self-check task. Ask your lead to challenge the assumption you found hardest to defend.

## Done checks

 one journey was explained aloud, follow-ups exposed real trade-offs, an earlier problem was attempted without notes and the gap log names a next action. **Troubleshoot:** if you freeze, trace a single concrete input before returning to abstractions. **Reflection:** which explanation improved because you admitted what you had not tested?

## Hand-in and feedback

Submit the required artifact or note with the checks you ran and one decision you can explain. Ask your reviewer one focused question; incorporate the answer before adding optional scope.

**Optional stretch:** Answer one follow-up about a trade-off using a concrete file or test rather than a memorized phrase. Skip this when the core timebox is used.
