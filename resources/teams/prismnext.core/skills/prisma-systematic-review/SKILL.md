---
name: prisma-systematic-review
description: Use when conducting a systematic review or structured literature survey — protocol, PRISMA flow, screening log, and synthesis, wired to the project's literature tools. A systematic review is a *method* (predefined protocol, auditable screening, reproducible counts), not an ad-hoc reading pile — for casual exploration or a quick coverage pass, this skill is overkill.
license: MIT
---

# PRISMA Systematic Review

A systematic review is a method, not a reading pile: protocol first,
auditable screening, reproducible counts. Where an ordinary review says "I
read some papers and here is my take", a systematic review can answer "how
did you search, what did you exclude, and why" — with logs. This skill
wires the PRISMA 2020 discipline into the project's literature tools.

**Not for**: exploring a new area, building a reading list, or drafting an
ordinary Related Work section (`writing-related-work` when enabled) — those
need no protocol and no flow diagram.

**Scaled-down mode**: when full PRISMA is heavier than the occasion but
coverage still needs to be defensible (e.g. a Related Work section someone
may challenge), keep the two minimal records — the queries as executed and
the exclusion reasons — and skip the protocol registration and flow
diagram. Say that you are doing so.

## When to use

- The user wants a systematic review / systematic survey, not an ad-hoc one
- A Related Work section needs defensible coverage ("how did you search?")
- Meta-analysis preparation (screening + data extraction stage)

## Files in this skill

- `references/prisma-2020-checklist.md` — the 27-item checklist, condensed;
  read it when drafting the report, not before.
- `templates/protocol-outline.md` — the protocol skeleton (write this FIRST).
- `templates/screening-log.csv` — one row per record: source, query, id,
  decision, reason.
- `templates/prisma-flow.md` — the flow-diagram counts file to keep current.

## Workflow

1. **Protocol before searching** — draft from `templates/protocol-outline.md`
   into the project (research question, PICO/SPIDER framing, inclusion &
   exclusion criteria, databases, date limits). Persist via
   `research-brief-update` or a protocol file after user confirmation.
2. **Search & log** — run `literature-discover` per planned query; record
   each query and hit count in the screening log. Reproducibility means the
   queries are written down *as executed*.
3. **Screen in two passes** — title/abstract pass then full-text pass; every
   exclusion gets a reason in the log. `literature-read` for abstracts;
   `literature-read-pdf` (intensive list) for full texts.
4. **Keep the flow counts current** — identified → deduped → screened →
   excluded (reasons) → included. `templates/prisma-flow.md` is the file of
   record; the diagram is generated from it at report time.
5. **Include** — papers that pass go to the library only with explicit user
   confirmation (`literature-add`); otherwise stage them for the session.
6. **Synthesize & report** — draft the review following the checklist;
   citations via `[@bibkey]` / staged `[n]`; `literature-export-bib` for the
   manuscript.

## Done when

- Flow-diagram counts reconcile with the screening log (audited against
  each other).
- Protocol deviations recorded with dates and reasons.
- Included papers are in the library (user-confirmed) or staged; the
  bibliography is synced.
- Scaled-down mode: the query log and exclusion reasons exist on disk —
  the rest is optional.

## Rules

- Counts in the flow diagram must reconcile with the screening log — audit
  them against each other before reporting.
- Deviations from the protocol are allowed but must be recorded with dates
  and reasons.
- Never silently re-run a query with different terms and keep the old count.
