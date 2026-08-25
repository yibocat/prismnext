# TikZ / pgfplots Recipes

The techniques the shipped templates use, plus the failures you will
actually hit. Read when a compile error is a TikZ construct you do not
recognize — not as a prelude to drawing. Prefer `library/catalog.json`
over inventing a new picture.

## Libraries — load what you use

```latex
\usetikzlibrary{positioning, arrows.meta, calc, fit, backgrounds, shadows}
\usepackage{tikz-cd}          % commutative diagrams
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}     % ALWAYS pin compat — behavior changes across versions
```

Missing `compat` is the most common pgfplots warning; an old `compat`
silently changes label placement and `axis cs` defaults.

## Positioning — never absolute-place everything

```latex
\begin{tikzpicture}[node distance=0.55cm and 1.1cm]  % vertical and horizontal
\node[a] (a) {...};
\node[b, right=of a] (b) {...};      % positioning library syntax
\draw (a.south) |- (b.west);         % orthogonal connector
\draw (a.east) -| (b.north);
```

Do NOT use the deprecated `right of=a` (no `=`): it measures border-to-center
and drifts. `below=2.2 of a` overrides the default distance per-node.

Anchors: `n.south`, `n.north east`, `n.base`, `n.west`. Multi-`|-` chains:
`(a) |- (b) |- (c)` routes through intermediate corners.

## Styles — one block at the top

```latex
\tikzset{
  block/.style={draw, rounded corners=2pt, minimum width=2.6cm, font=\small},
  stage/.style={block, fill=blue!8},        % style inheritance
  flow/.style={-{Stealth[length=2.5mm]}, thick},
}
```

Per-node overrides last: `\node[encoder, fill=red!10]`. If you find yourself
repeating an override, it belongs in the style.

## Arrows — arrows.meta only

`-{Stealth}`, `<-{Latex}`, `-{Classical TikZ Rightarrow}`; combine
`<->`, add `dashed`, `bend left=30`, `loop above`. The old
`\usetikzlibrary{arrows}` + `>=latex'` is deprecated — do not use it in new
figures.

## Labels on edges

```latex
\draw[flow] (a) -- node[above, font=\footnotesize] {$\theta$} (b);
\draw[flow] (a) to[out=30, in=150] node[midway, above] {$\phi$} (b);
```

## tikz-cd essentials

- Cells separated by `&`, rows by `\\`; labels `"f"` and `"f"'` (prime =
  other side).
- `row sep=large, column sep=large` control grid spacing.
- **Ampersand pitfall**: inside `\node{...}`, `beamer` frames, or macro
  arguments, `&` breaks — fix with
  `\begin{tikzcd}[ampersand replacement=\&]` and write `\&` between cells.

## pgfplots essentials

```latex
\addplot+[color=oiblue, thick] coordinates {(0,1) (1,2)};
\addplot table[x=step, y=loss, col sep=comma] {data.csv};   % real data
\addplot[domain=0:2, samples=100] {exp(-x)};                % symbolic
```

- Error bars: `error bars/.cd, y dir=both, y explicit` + `+- (0, 0.05)` or
  `y error=err` column in table.
- Log axes: `\begin{semilogyaxis}` / `loglogaxis` — not a style on `axis`.
- Size for the target column: `width=8.6cm` for a ~9 cm single column; check
  the venue's column width and set `height` for aspect, never scale with
  `\resizebox` (fonts shrink inconsistently).
- `legend style={draw=none, fill=none}` + `legend cell align=left` reads
  cleaner than the boxed default.

## Compilation notes

- These templates are standalone figures. Compile with
  `latex-compile-standalone` on the figure path. Do not call `latex-root`
  or compile the paper to "check the engine."
- Error messages point at the *end* of the picture, not the mistake: a
  missing `;` or an unknown style key usually sits a few lines above the
  reported line. Edit the `.tex`, compile again. Do not rasterize the PDF
  to inspect it.
- `\tikzexternalize` belongs in a full manuscript build, not this path.

## Choosing TikZ vs matplotlib

- Structure, schematics, commutative diagrams, symbolic function plots →
  TikZ (fonts match, infinite zoom, diffable).
- Data from experiment runs, large CSVs, histograms/heatmaps of results →
  matplotlib (`figure-matplotlib`), include the PDF.
