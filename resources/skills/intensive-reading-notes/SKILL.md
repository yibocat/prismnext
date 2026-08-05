---
name: intensive-reading-notes
description: Use when reading library papers deeply (intensive reading) and turning them into structured, linked project notes or reading cards with page-level evidence.
license: MIT
---

# Intensive Reading Notes

Turn deep reading into durable project notes — evidence-tied, cross-linked,
and reusable by later chats.

## When to use

- The user is intensively reading one or more library papers
- They want reading cards / structured notes, not just chat answers
- Preparing literature groundwork that later sections will build on

## Workflow

1. **Gate** — `literature-intensive-reading` action=add for each paper
   (the list is per chat session).
2. **Extract** — `literature-read-pdf`; if the extract is missing, call with
   `force=true` to start background extraction, then retry. Use `pages=` /
   `query=` to scope instead of dumping whole papers.
3. **Structure each note** —
   - bibkey + full citation line
   - Problem & why it matters (2–3 sentences)
   - Method in 3 bullets
   - Key results with page refs (`p.X`)
   - Strengths / limitations
   - Relation to this project (link to `.brief.md` themes when relevant)
   - Open questions
4. **Write to the notes area** — follow Workspace Folder Descriptions for the
   notes folder; one file per paper, filename keyed by bibkey. Embed figures
   with `[@bibkey|images/fig-N.png]` only when a figure genuinely clarifies.
5. **Cross-link** — references between notes via `[@bibkey]`; update the
   index note if the project keeps one.
6. **Suggest next reads** via `literature-discover` only when the user wants
   to expand the set.

## Rules

- Quote with page numbers; mark your own speculation distinctly from paper
  content.
- Notes live on disk — chat summaries are not the record.
- No library writes beyond the intensive-reading list (no add/delete).