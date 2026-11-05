# Finish the last slice without hiding the hard interaction

**Estimated effort:** 105 minutes. **Prerequisite:** capstone slices one and two plus the day 25 regression checks. Start from the working React project and use the commands recorded in your brief. **Artifact:** slice three and evidence that its hardest interaction works beyond your normal desktop setup.

**Problem:** adding one last feature can make the overall journey worse if focus disappears, a small screen overflows or a delayed operation looks complete too soon.

## Complete the planned slice · 40 minutes

Create `feat/capstone-final-slice`. Re-read the third acceptance check from day 22. For Study Queue, complete a topic and allow Undo: both actions persist confirmed state, communicate failure and remain usable with the keyboard. Reuse yesterday's save adapter and pending/failure policy instead of inventing another write path.

Decide where focus goes if completing a topic removes it from the Open filter. Keep focus on a meaningful remaining control or offer a stable status/Undo area. Do not leave the person at the top of the page with no explanation. Announce the changed result count without interrupting typing elsewhere.

Do not add drag-and-drop, an account system or a fourth slice. If behind schedule, simplify the third slice while preserving its user outcome, and update the brief honestly.

## Exercise three demanding conditions · 25 minutes

1. **Keyboard:** use Tab, Shift+Tab, Enter and Space as appropriate. Complete and undo without a mouse. Verify visible focus and the next focused element after a list item disappears.
2. **Narrow screen and zoom:** check 360px width and 200% browser zoom. Use a long title. Buttons must wrap or remain reachable; hiding overflow is not a repair for inaccessible content.
3. **Slow operation:** inject a consistent save delay through your demo/test adapter. Confirm pending feedback appears immediately and repeated activation cannot create conflicting writes. A delayed local save is a simulation, not evidence that the app works offline.

## Measure before changing performance · 20 minutes

Choose one interaction, such as filtering 500 synthetic topics. Use the browser's Performance panel to record the same action three times with the same dataset, browser and CPU-throttling setting. Record the middle result and what was timed; separate an intentional adapter delay from rendering work.

Investigate the trace before optimizing. Remove an observed unnecessary recomputation or reduce expensive repeated rendering, then repeat the same scenario. If there is no demonstrated bottleneck, retain the simpler code and record “no optimization justified.” Do not claim a percentage improvement from unrelated runs or add memoization everywhere. A documented decision to avoid speculative optimization is a valid trade-off.

## Verify and submit · 20 minutes

Run the existing regression suite and add one check for completion/undo. Open a focused PR with the third acceptance scenario, keyboard/narrow/slow evidence and the measurement setup/results. Submit its link; ask the reviewer to complete a topic while Open is selected and explain where focus lands.

**Done:** all three planned slices work; the difficult interaction is reachable and recoverable; any performance claim has comparable evidence. **Troubleshoot:** if the list jumps, check stable ids and focus handling before adding animation. **Reflection:** which polish change removed friction, and which attractive feature did you deliberately leave out?
