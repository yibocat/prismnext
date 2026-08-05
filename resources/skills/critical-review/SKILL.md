---
name: critical-review
description: Use for structured, confidential critical evaluation of a paper, a manuscript draft, or a set of claims — claims-vs-evidence table, load-bearing assumptions, reproducibility red flags.
license: MIT
---

# Critical Review

A rigorous, confidential pass over scholarly work — yours or others'. The
goal is to find what breaks before reviewers do.

## When to use

- Evaluating a manuscript draft before submission or sharing
- Deep-assessing a library paper's claims and evidence
- Stress-testing a set of claims made in chat

## Workflow

1. **Fix the object** — library paper via `literature-read` /
   `literature-read-pdf`; manuscript via the file tools; or the claims as
   stated in chat.
2. **Claims table** — each load-bearing claim → its evidence in the text →
   verdict: supported / weak / unsupported.
3. **Assumptions** — name them explicitly; mark which are load-bearing.
4. **Red flags** — p-hacking, HARKing, cherry-picked baselines, missing
   ablations, overclaimed novelty, unreleased code/data promises, citation
   stuffing.
5. **Reproducibility** — could an independent group rerun this from the text
   alone? List exactly what is missing.
6. **Verdict** — what evidence would change your mind; concrete fixes ranked
   by leverage.

## Rules

- Confidential and local — evaluate the work, never rank people.
- Ground every criticism in the text (quote / page / section), not vibes.
- For external papers, stage before citing (`literature-stage`).
- Orchestrator may delegate a prose pass to `peer-reviewer`; experts cannot
  Task — fold prose issues into your own report.