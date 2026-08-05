# Desk-Reject Checklist

Run before any submission, regardless of venue. Each item is a real
desk-reject cause seen in practice. Venue-specific numbers (page limits,
deadlines, anonymity period) change every cycle — verify them against the
current year's official CFP / author guide, never from memory.

## Anonymity (submission versions)

- [ ] No author names, affiliations, acknowledgments, or grant numbers
- [ ] Self-citations written in third person
- [ ] No identifying metadata in the PDF (check document properties)
- [ ] Code/data links anonymized or removed

## Format

- [ ] Correct template/class for this venue and cycle
- [ ] Page count within limit (count per venue rules: content vs references)
- [ ] Fonts embedded in the PDF
- [ ] No placeholder text, TODOs, or comment artifacts (`\todo`, highlighted
      notes) left in
- [ ] Figures legible at print size; all figures/tables referenced in text

## Completeness

- [ ] Abstract within word limit
- [ ] Required sections present (limitations / checklist / ethics / CCS /
      declarations — per the venue's current CFP)
- [ ] References complete: no `?` unresolved citations, no missing fields
- [ ] Compiles clean — zero errors, and review the warnings

## Process

- [ ] Dual-submission / arXiv policy for this venue checked
- [ ] Supplementary material format and size limits checked
- [ ] Final PDF is the one you actually proofread (not a stale build)

Map to tools: compile + unresolved citations → `latex-compile`;
`?` citations and bib gaps → `citation-health`.
