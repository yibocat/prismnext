# Outline — <working title of THIS document>

> One outline per document. The file is the spec **and** the progress board:
> keep both halves in sync as the writing moves. Status markers:
> `pending` / `drafting` / `done` / `stale` (ground moved — needs a refresh
> pass).

## Story

<One paragraph: what this document argues, for whom, and why now. Example
shape — "We show that X, long treated as A, is actually B; this lets
<audience> do C; it is possible now because D.">

## Audience

<Who reads this; what they already believe; how much framing each section
therefore needs.>

## Sections

### 1. Introduction
- **Purpose**: <what this section does for the story>
- **Sources**: `.brief.md` §RQ1; `notes/xyz.md`; staged papers [3], [7]
- **Promises made**: C1 "method improves Y under Z" → kept by §4;
  C2 "costs no more than baseline" → kept by §4.3
- **Pattern**: problem-driven (see `writing-introduction` patterns)

### 2. Preliminaries
- **Purpose**: notation + the two definitions §3 builds on
- **Sources**: `notes/definitions.md`
- **Promises made**: none to others; consumes nothing but the brief

### 3. Methods
- **Purpose**: the construction; keeps C1's mechanism
- **Sources**: discussion 2026-07-30 (why variant B lost); island `exp-…`
  receipts for the instantiation

### 4. Results
- **Purpose**: proves C1, C2 with run receipts
- **Sources**: `exp-…/runs.jsonl`; snapshots …

### 5. Conclusion
- **Purpose**: answers Q1, Q2 raised in §1; limitations

## Promise map

| Promise / question | Raised in | Kept / answered in | Evidence |
|---|---|---|---|
| C1: improves Y under Z | §1 | §4.2 | runs r3, r5 (`exp-…`) |
| C2: no extra cost | §1 | §4.3 | run r7 |
| Q1: when does it fail? | §1 | §5 | §4.4 negative cells |

## Build order & status

1. [done] Methods — drafted 2026-08-02; receipts anchored
2. [drafting] Results — §4.2 written; §4.3 waiting on re-run r7
3. [stale] Introduction — C2's number moved after r7 re-run; refresh the
   contribution sentence
4. [pending] Related Work — staged papers ready ([3], [7], [9])
5. [pending] Conclusion — blocked until Results is done

<!-- Patch this file when the story moves; tell the user what changed and
     which statuses flipped. -->
