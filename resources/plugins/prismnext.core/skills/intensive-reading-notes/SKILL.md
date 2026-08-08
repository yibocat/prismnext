---
name: intensive-reading-notes
description: Use when reading library papers deeply (intensive reading) and turning them into structured, linked project notes or reading cards with page-level evidence. Depth and note shape follow the reading purpose — the skeleton is a reference, not a mold.
license: MIT
---

# Intensive Reading Notes

Turn deep reading into durable project notes — evidence-tied, cross-linked,
and reusable by later chats. **How you read follows why you read**: the
skeleton below is a reference, not a mold — reshape it per paper and
purpose.

## When to use

- The user is intensively reading one or more library papers
- They want reading cards / structured notes, not just chat answers
- Preparing literature groundwork that later sections will build on

## Workflow

1. **Gate** — `literature-intensive-reading` action=add for each paper
   (the list is per chat session).
2. **Purpose first** — why is this paper being read? The purpose sets the
   depth and the note's center of gravity:
   - *adopt the method?* → method details, reproducibility, what you'd
     need to re-implement
   - *find the gap?* → limitations, boundary conditions, unstated
     assumptions
   - *position for related work?* → claims, comparison dimensions, how it
     situates itself
   When the purpose is unclear and it changes how you'd read, ask
   (`question`); when it's obvious from the conversation, don't.
3. **Extract** — `literature-read-pdf`; if the extract is missing, call with
   `force=true` to start background extraction, then retry. Use `pages=` /
   `query=` to scope instead of dumping whole papers.
4. **Structure each note** — reference skeleton (reshape freely):
   - bibkey + full citation line
   - Problem & why it matters (2–3 sentences)
   - Method / key content
   - Key results with page refs (`p.X`)
   - Strengths / limitations
   - Relation to this project (link to `.brief.md` themes when relevant)
   - Open questions
   …weighted toward the purpose from step 2 — a gap-hunting note leads
   with limitations; an adoption note leads with the method.
5. **Write to the notes area** — the notebook workspace folder when
   configured, else a plain `notes/` folder at the project root; one file
   per paper, filename keyed by bibkey. Embed figures with
   `[@bibkey|images/fig-N.png]` only when a figure genuinely clarifies.
   Notes are durable assets — they do not belong in `specs/` (working
   documents) or the brief.
6. **Cross-link** — references between notes via `[@bibkey]`; update the
   index note if the project keeps one.
7. **Suggest next reads** via `literature-discover` only when the user wants
   to expand the set.

## Done when

- One note file per paper on disk, keyed by bibkey.
- Page-level refs for every quoted or paraphrased claim.
- Your own inference/speculation marked distinctly from paper content.
- The project relation is stated — or explicitly "no relation found".

## Rules

- Distinguish **quote / paraphrase / inference**: quotes with page numbers,
  paraphrase close to the text, inference always marked as yours.
- Notes live on disk — chat summaries are not the record.
- No library writes beyond the intensive-reading list (no add/delete).
