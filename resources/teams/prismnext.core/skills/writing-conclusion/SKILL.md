---
name: writing-conclusion
description: Use when drafting a Conclusion / Discussion section — answering the questions the Introduction raised, stating honest limitations, and marking what the evidence does and does not license. No new claims appear here.
license: MIT
---

# Writing: Conclusion

The Conclusion closes the loop the Introduction opened: every question
raised there gets an answer here — including "no" and "weaker than hoped".
It is also where trust is won: **limitations stated by you read as command;
limitations found by the reader read as concealment.**

If `writing-design` produced `outline.md`, the promise map is the closing
checklist. Without an outline, re-read the Introduction and list its
questions yourself.

## When to use

- Drafting or rewriting Conclusion / Discussion
- Aligning a Conclusion with what the evidence actually showed
- Writing limitations that are honest without being self-sabotaging

## Files in this skill

- `templates/synthesis.md` — answers → limitations → implications → future
  work. The standard close.
- `templates/discussion-first.md` — interpretation and mechanism before the
  recap; best when the meaning of the results needs argument, not just
  restatement.

These are **reference patterns, not molds** — adapt, blend, or depart as
the material demands; the bar is a section that reads true, not one that
matches a file.

## Workflow

1. **Collect the questions** — from the promise map / Introduction: what
   must be answered. Use `question` when the call is genuinely theirs —
   e.g. what the reader should take away, how candid the limitations should
   be (sets the structural pick and candor level); when the conversation
   already answers these, do not re-ask.
2. **Answer each** — the answer is what the Results showed, at the strength
   they showed it. Downgrade overclaims here, not after review.
3. **State the limitations** — assumptions that bind, evidence that is
   thin, scope the results do not cover. Each limitation: what it threatens
   and what it leaves standing.
4. **Implications and future work** — what a reader may now do differently;
   what is genuinely next (not a grant proposal).
5. **Consistency pass** — nothing here is newer than the Results: no claim,
   number, or comparison appears for the first time in the Conclusion.
6. **Verify** — `latex-compile`.
7. **Report to the outline** — when `outline.md` exists, mark this section
   `done` with a one-line note; if the answers moved any promise, patch the
   promise map and tell the user what changed.

## Done when

- Every Introduction question has an answer at the evidence's true strength.
- Limitations are stated with their blast radius.
- Zero claims appear here that Results did not support.
- `latex-compile` passes.

## Rules

- No new evidence, no new claims — the Conclusion interprets, it does not
  report.
- Future work is one paragraph, concrete, and actually possible.
