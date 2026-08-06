---
name: writing-design
description: Use when starting to write a paper, report, or any substantial document from the project's research — the outline gate. Discuss the story, audience, and section plan with the user and fix the outline on disk BEFORE any section is drafted. Not for revising a single existing section (use the section skill directly).
license: MIT
---

# Writing: Design (the outline gate)

No drafting before the outline exists and the user has confirmed it. The
outline is **this document's own plan** — the family prescribes no fixed
section list and no fixed rhetorical pattern; both are decided here, per
document, from the research itself.

## When to use

- Starting a new manuscript, report, or write-up from the project
- Restructuring an existing draft whose story has drifted
- Deciding which sections a document needs at all

## Workflow

1. **Gather the raw material** —
   - `research-brief-read` for the intellectual spine
   - working documents in `specs/` (analysis, decision records) and notes
     the user points at
   - `literature-search` for the themes the document will touch
   - `experiment-log` list when empirical results will be reported
2. **Propose the story** — one paragraph: what this document argues, for
   whom, and why now. If you cannot state it in one paragraph, the document
   is not ready to outline — say so and discuss.
3. **Discuss the outline with the user** — a conversation, not a form.
   Decide what you can decide; use the `question` tool only when a fork is
   genuinely the user's call. Typical such forks: the story framing (offer
   your candidate paragraph for them to correct — never ask into a vacuum),
   the audience (decides how much framing each section needs), the section
   list (propose one from the story; sections earn their place, no preset
   count), per-section source material (which runs, papers, notes), and
   writing preferences. One question at a time; skip whatever the
   conversation already answered. Most users engage on story and audience
   and wave the rest through — then propose the full outline yourself and
   confirm it in one go.
4. **Write the outline to disk** — copy `templates/outline.md` and fill it
   in; save as `outline.md` at the root of the manuscript workspace folder
   (next to the main `.tex`; for a standalone note, next to the document).
   Contents:
   - the story paragraph and the audience
   - per section — purpose, sources, and the promises it makes to / keeps
     from other sections (the **promise map**: Introduction's claims → the
     sections that deliver them; Conclusion → the questions it must answer)
   - **Build order & status** — the sections in dependency order (e.g.
     Methods/Results before Conclusion; Related Work can go anytime), each
     with a status marker: `pending` / `drafting` / `done` / `stale`.
     `stale` means the ground moved under a finished section (re-runs
     changed numbers, the story was patched) and it needs a refresh pass.
5. **Confirm, then draft** — only after the user confirms the outline,
   draft section by section (section skills when enabled). To push through
   the build order over multiple turns, enter plan mode via `suggest-plan`
   and work the items one by one — **read `references/plan-mode.md` first**
   for when plan mode is appropriate, how to enter, and the plan document
   shape.

## Done when

- `outline.md` exists with story, audience, section list, sources, and the
  promise map.
- The user has explicitly confirmed the outline.
- No section has been drafted before confirmation.

## Rules

- The outline is per-document; two papers from one project get two outlines.
- `outline.md` is the single source of truth for **progress**: when a
  section is drafted or refreshed, mark its entry `done` with a one-line
  note; when results or the story change, mark affected sections `stale`
  and tell the user. Resuming after a break = read `outline.md`.
- Refresh `outline.md` when the story changes mid-writing — patch it, tell
  the user what moved, and flag the sections whose promises changed.
- Section skills are optional upgrades: without them, apply the same
  grounding discipline inline (citations from the library, numbers from
  runs).
- The outline is a plan, not a cage — the user may restructure anytime;
  your job is to keep the file and the text in sync.
