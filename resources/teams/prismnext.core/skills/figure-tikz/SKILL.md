---
name: figure-tikz
description: Use when drawing a standalone TikZ figure — catalog templates first (OpenTikZ ML/systems plus PrismNext transformer, U-Net, diffusion, GNN, VAE, causal DAG, PRISMA, swimlane, timeline, tree, Venn), then generic architecture / commutative / small pgfplots fallbacks. Closed path: match catalog, copy the .tex, edit only the contract parameters, latex-compile-standalone, stop when the PDF sits next to the source. Not for experiment-data plots (→ figure-matplotlib), manuscript wiring (→ figure-pipeline), or chat panel cards (→ figure-interaction).
license: MIT
---

# LaTeX TikZ Graphics

Start from a shipped, compilable figure. When the PDF is next to the
`.tex`, the job is done.

`library/catalog.json` is the menu. It mixes a vendored
[OpenTikZ](https://opentikz.org/) slice (CC0 templates, examples, and
ml/systems icons) with PrismNext templates (MIT, same `edit_contract`).
Paths in this file (`library/…`, `assets/…`) are relative to this skill
folder — the directory that contains this `SKILL.md` — not the project
root. `read` / `ls` / `grep` / `find` resolve those relatives against
this folder; bash may list or cat files here. Do not edit this folder.
Compile with `latex-compile-standalone`. Do not fetch GitHub, do
not run `latexmk`, do not start from an empty `tikzpicture`.

## Pick a base

1. Read `library/catalog.json`. Match the request to an `id` / `name` /
   `tags` / `domain`. One clear hit → name it and proceed. Several fit →
   list the `id`s and let the user pick.
2. **Icon** (`type: icon`) — a glyph (GPU, dataset, attention, …), not a
   full paper figure. Copy it when composing or swapping a mark inside a
   template. Compile the icon alone only if the user asked for that
   glyph. Brand-logo icons are **not** shipped; do not look for
   `icons/brands/` or download marks. Templates that need logos already
   inline them.
3. No catalog hit → use a fallback:

| Ask | Template |
|-----|----------|
| Generic layered boxes / pipeline / schematic | `assets/architecture-diagram.tex` |
| Commutative / tikz-cd | `assets/commutative-diagram.tex` |
| Small or symbolic line plot | `assets/pgfplots-lines.tex` |
| Data from a run / large CSV | **Stop.** `figure-matplotlib` |

## Catalog path (closed)

Four steps. No reconnaissance.

1. **Copy** `library/<path>/<tex>` into the project's figures folder
   (Workspace Folder Descriptions — do not guess `figures/` if the
   project uses another name). Rename to the figure. Never edit the
   file under `library/`.
2. **Edit the copy**
   - **Template** (`has_edit_contract: true`): read that item's
     `template.meta.json` `edit_contract`. Change only listed
     `parameters` (the `\def` block). Follow `operations`. Keep every
     `invariant` and the `node_naming` scheme. Colors only via
     `otblue` `otorange` `otteal` `otpurple` `otgray` (tints like
     `otblue!15` are fine). Never a hex or a stock name (`blue`, `red`).
   - **Example** (no contract): change labels; do not rewrite the
     geometry. Same five palette names.
   - **Icon**: keep the glyph; recolor only via palette names.
3. **Compile** — `latex-compile-standalone` with `mainFile` set to that
   figure path. On error: edit the copy, compile again. Never run a TeX
   engine via bash.
4. **Stop.** Chat already previews the PDF next to the source.

**Done** = that PDF exists. One short sentence in chat (what the
diagram shows). Nothing else.

## Fallback path

Same four-beat: **copy → edit → `latex-compile-standalone` → stop.**

- **Architecture** — node text, which nodes exist, edges, and the one
  `\tikzset` block. Keep `standalone`, `positioning`, `arrows.meta`.
  Place nodes with `right=of` / `below=of` only.
- **Commutative** — edit the `tikzcd` cells and arrows only.
  Ampersand inside a node or beamer: `[ampersand replacement=\&]`.
- **pgfplots** — keep `\pgfplotsset{compat=1.18}`. Swap series and
  labels. If the data is an experiment CSV, leave this skill.

## Do not (unless the user named that next step)

- `latex-root` or `latex-compile` — those are the paper
- bash `which` / `ls` / `sips` / `gs` / `pdftoppm` / `rm`
- `image-describe`, or rasterize the PDF so you can "look at it"
- `delete` conversion leftovers or the compiled PDF
- `\includegraphics` into the manuscript, or `interaction-write`

Those are other skills or a later user ask.

## Craft (on demand)

- Catalog items: one `\def` block at the top is the contract. Do not
  spam per-node colors.
- Fallback items: one `\tikzset` at the top; arrows via `arrows.meta`
  (`-{Stealth}`), not `>=latex'`.
- Dark palette, or a venue `\resizebox`, only when the user asked —
  `library/reference/color-palettes/color-palettes.md`.
- `references/tikz-recipes.md` only when a compile error is a TikZ
  construct you do not recognize.
