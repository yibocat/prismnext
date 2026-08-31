---
name: figure-typst
description: 'Use when the manuscript root is `.typ` (or the user asked for CeTZ / Typst diagrams) — catalog templates first (layered boxes, fletcher exchange), copy the `.typ`, edit only the contract lets, typst-compile-standalone, stop when the PDF sits next to the source. LaTeX TikZ → figure-tikz. Not for experiment-data plots (→ figure-matplotlib), manuscript wiring (→ figure-pipeline), or chat panel cards (→ figure-interaction).'
license: MIT
---

# Typst / CeTZ Graphics

Typst papers only (`.typ` root). If the paper is LaTeX, use `figure-tikz`.

Start from a shipped, compilable figure. When the PDF is next to the
`.typ`, the job is done.

`library/catalog.json` is the menu. Paths in this file (`library/…`)
are relative to this skill folder — the directory that contains this
`SKILL.md` — not the project root. Do not edit this folder. Compile
with `typst-compile-standalone`. Do not bump pins (`@preview/cetz:0.3.4`, `@preview/fletcher:0.5.8`).
Do not start from an empty `canvas` / `diagram`. First compile may
download the pinned Universe packages (network); do not `curl` them
yourself.

## Pick a base

1. Read `library/catalog.json`. Match the request to an `id` / `name` /
   `tags` / `domain`. One clear hit → name it and proceed. Several fit →
   list the `id`s and let the user pick.
2. No catalog hit → closest template, still the closed path. Do not
   invent a third package.

| Ask | Template |
|-----|----------|
| Layered boxes / pipeline / schematic | `architecture-boxes` (CeTZ 0.3.4) |
| Commutative / exchange / arrows | `exchange-diagram` (fletcher 0.5.8) |
| Data from a run / large CSV | **Stop.** `figure-matplotlib` |

Pins are part of the contract. `fletcher:0.5.8` already pulls
`cetz:0.3.4` — do not import a newer CeTZ in the same file.

## Catalog path (closed)

Four steps. No reconnaissance.

1. **Copy** `library/<path>/<typ>` into the project's figures folder
   (Workspace Folder Descriptions — do not guess `figures/` if the
   project uses another name). Rename to the figure. Never edit the
   file under `library/`.
2. **Edit the copy** — read that item's `template.meta.json`
   `edit_contract`. Change only listed `#let` parameters. Follow
   `operations`. Keep every `invariant`. Do not restyle from scratch.
3. **Compile** — `typst-compile-standalone` with `mainFile` set to that
   figure path. On error: edit the copy, compile again. Never run a
   Typst engine via bash.
4. **Stop.** Chat already previews the PDF next to the source.

**Done** = that PDF exists. One short sentence in chat (what the
diagram shows). Nothing else.

## Do not (unless the user named that next step)

- `typst-compile` — that is the manuscript build, not a figure
- `latex-compile-standalone` or TikZ
- bash `typst` / `tinymist` / `curl` / `rm`
- `#image` into the manuscript, or `interaction-write`
- bump `@preview/cetz` or `@preview/fletcher` pins
