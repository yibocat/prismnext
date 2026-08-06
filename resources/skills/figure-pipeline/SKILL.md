---
name: figure-pipeline
description: Use when turning experiment outputs or project data into publication-quality figures wired into the manuscript and reopenable as interaction objects. This is the plumbing (source data → script → manuscript wiring); the chart craft itself lives in figure-matplotlib, the panel presentation in figure-interaction.
license: MIT
---

# Figure Pipeline

From artifact to a manuscript-ready figure: scripted, reproducible, wired
into the document, and reopenable in chat. This skill owns the **plumbing** —
where data comes from, where outputs land, how figures enter the manuscript.
It stands alone: when the sibling figure skills are disabled, apply the
inline standards below.

## When to use

- Creating or regenerating manuscript figures from experiment outputs
- A figure must survive re-runs (scripted, not hand-drawn)
- The user wants a figure they can reopen and iterate on in chat

## Workflow

1. **Source** — locate data via `experiment-log` read; prefer run artifact
   snapshots over mutable working paths.
2. **Script** — write or adjust the plotting script under the island or the
   project's scripts folder; run it with `experiment-run` (the shared
   project venv is injected by the tool). If `figure-matplotlib` is enabled,
   start from its template and style file.
3. **Output** — save into the project's figures folder (see Workspace Folder
   Descriptions — do not assume a fixed name).
4. **Standards** — the full craft checklist lives in `figure-matplotlib`
   (chart selection, palettes, style file) when enabled. Either way, the
   minimum bar never moves: axis labels with units, legible at final column
   width, colorblind-safe palette, caption states what the figure *shows*
   (not just what it is).
5. **Wire into the manuscript** — `\includegraphics` with the
   figures-relative path, caption, `\label{fig:...}`, and an in-text
   reference.
6. **Reopenable** — `interaction-write` so the figure becomes a reopenable
   chat object carrying its spec (presentation standards:
   `figure-interaction` when enabled).
7. **Verify** — `latex-compile`.

## Rules

- Never hand-draw data values; every figure regenerates from its script.
- Historical figures come from run artifact snapshots, not files that later
  runs may overwrite.
