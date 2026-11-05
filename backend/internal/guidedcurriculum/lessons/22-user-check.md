# Test the task before polishing the idea

**Estimated effort:** 30 minutes. **Prerequisite:** `docs/capstone/brief.md` from today's planning task. **Artifact:** a sketch, a short observation log and one scope decision. No recruited users or external design account are required.

**Problem:** a design can sound clear while hiding the next action. Test whether the primary task makes sense before spending tomorrow implementing it.

## Core work: Prepare a five-minute attempt · 5 minutes

Draw two or three screens on paper or write a text prototype in `docs/capstone/user-check.md`. For Study Queue, show an empty list, an Add topic form and a list with Open/Completed filters. Include actual labels and plausible data, not decorative boxes.

Write one task without naming the control to press: “You want to practise array methods tomorrow. Add that topic and then find only unfinished topics.” Avoid “Click Add topic,” which answers your own usability question.

## Observe, without pretending · 10 minutes

If someone is available, ask them to attempt the task using the sketch. Explain that the sketch is being tested. Let them point or narrate before you help; do not collect personal information. Record where they looked, what they expected and the assistance you gave.

Working alone is valid: put the sketch aside briefly, then walk through the exact task as a first-time user. Label every finding **self-walkthrough**. You cannot claim that an independent user discovered it. Write an unresolved question for a future reviewer instead of inventing a quote.

```text
Method: self-walkthrough
Task: add "Array methods", then find unfinished topics
Observation: I could not tell whether Save succeeded; no confirmation appeared.
Interpretation: save feedback may be ambiguous.
Decision: keep the title visible on failure and announce success after confirmed save.
Uncertainty: another person has not tried the labels yet.
```

## Make one useful change · 10 minutes

Change a label, remove a step or tighten an acceptance check in the brief. Record the before/after wording and the observation behind it. A positive finding is also useful; retain a design that worked and state what remains untested. Do not add a major feature merely because someone requested it.

## Close the loop · 5 minutes

Post a short task note: method, attempted task, hesitation, decision and remaining uncertainty. If using Git, include the log in the planning PR or a small follow-up commit. Ask your lead to attempt the same task without an explanation.

**Done checks:** the task tests an outcome; assistance is recorded; evidence and interpretation are separate; the changed acceptance check can be demonstrated tomorrow. **Troubleshoot:** if a participant asks what a button means, record that before teaching them. If your own familiarity hides problems, try an empty list or an interrupted save. **Retrieval:** how does observing behaviour differ from asking someone whether they like an idea?

## Done checks

Verify the required artifact against this task’s visible reviewer criteria and the examples above. Record the result of each check you actually ran.

## Hand-in and feedback

Submit the required artifact or note with the checks you ran and one decision you can explain. Ask your reviewer one focused question; incorporate the answer before adding optional scope.

**Optional stretch:** Repeat the same observation with a second person, if available, and compare the findings without claiming that two people represent everyone. Skip this when the core timebox is used.
