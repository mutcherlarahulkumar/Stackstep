# Publish a case study whose claims can be checked

**Estimated effort:** 90 minutes. **Prerequisite:** your capstone brief, PRs, review log, test evidence and release checklist. **Artifact:** a 500–800 word Markdown case study in your own repository. “Publish” here means make the reviewed document available in the repo; a blog account or public deployment is optional.

**Problem:** a list of technologies says little about your decisions. Help a reader verify what problem you addressed, what you contributed and what the evidence actually supports.

## Gather the evidence · 15 minutes

Create `docs/capstone-case-study` as a branch. Collect three to five real links: planning PR, a representative implementation diff, a regression test, the release checklist and a demo image/video if available. Keep screenshots under a reasonable size and free of personal data. If an artifact is private, label that limitation rather than creating a broken public promise.

Do not invent usage statistics, independent reviewers or performance improvements. Your self-walkthrough is useful evidence about your own experience; it is not a user study. A simulated failed write demonstrates a tested failure path, not a real service outage.

## Write for someone who has not followed the project · 40 minutes

Create `docs/capstone/case-study.md` with this structure:

1. **User and situation:** one concrete problem and the prior workaround. State how you learned about it, including self-observation when applicable.
2. **Scope and contribution:** the three completed slices and your own responsibilities. Credit collaborators, reused components and external help honestly.
3. **A key decision:** compare two plausible options, your constraint and why you chose one. For example, local storage made the demo self-contained but cannot provide cross-device recovery.
4. **A difficult failure:** reproduce a real bug or clearly labelled injected regression, explain its cause and link the protecting test.
5. **Evidence of the result:** link the PR/test/demo and provide the exact command or short journey a reader can repeat. Include comparable setup for any performance claim.
6. **Limitations and next experiment:** one remaining user risk and a small experiment that could change your next decision. Avoid a long feature wish list.

Use short excerpts, not a pasted codebase. A claim such as “retains typed text after a rejected save” should point to the specific check that establishes it. Distinguish implemented behaviour from planned improvements.

## Verify every claim · 20 minutes

Follow each link and run the documented demo/check command from the release guide. Read the document at narrow width. Check code fences and headings. If adding an image with a Markdown relative path, open the rendered document in your repository and verify the path; include useful alternative text. An image is optional.

If evidence contradicts your draft, correct the claim instead of changing the test to match the story. If a third slice was reduced, describe the actual shipped scope and why.

## Submit and request an evidence review · 15 minutes

Inspect and commit the document and any intended assets, push the branch and open a PR. Submit its link as the blog task hand-in; you do not need an external article URL. Ask a reviewer to identify one unsupported claim and one decision they can now explain back to you. Respond with a correction or evidence and keep the discussion attached to the PR.

**Done:** the case study links real work, separates individual contribution from assistance and states limitations plainly. **Reflection:** which claim became smaller and more credible when you checked its evidence?
