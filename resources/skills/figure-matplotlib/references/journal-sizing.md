# Journal sizing — column widths, fonts, formats

The rule that settles most figure arguments: **design at the exact final
width**. A figure made wide and shrunk by the venue ends up with 4 pt text
and hairline rules. Set the width in the script; never let the layout
office rescale your fonts.

Conversion: `mm / 25.4 = inches`. In matplotlib:
`figsize=(89/25.4, h)` for a Nature single column.

## Column widths (print journals)

| Venue | Single column | Double column | Notes |
| --- | --- | --- | --- |
| Nature | 89 mm (3.5 in) | 183 mm (7.2 in) | max height 247 mm; prefer single-column figures |
| Science | 55 mm | 120–174 mm | 90 mm intermediate exists; check current guide |
| Cell | 85 mm | 114 / 174 mm | 1.5-column (114 mm) is common for panels |
| PNAS | 87 mm | 114 / 178 mm | — |
| IEEE journals | 88.9 mm (3.5 in) | 181.6 mm (7.16 in) | — |
| Physical Review | 86 mm (3.4 in) | 172 mm (6.8 in) | — |

Always confirm against the *current* author guide of the target venue —
these drift by a few millimetres between revisions.

## Conferences (LaTeX templates)

Do not guess: measure the template. Add to the manuscript preamble, compile,
read the log:

```latex
\usepackage{layouts}
... \printinunitsof{mm}\prntlen{\textwidth} % or \the\textwidth in the log
```

ICML `\textwidth` ≈ 6.75 in; NeurIPS ≈ 5.5 in; ACL single column ≈ 3.15 in.
A full-width `figure*` environment uses `\textwidth`; a single-column
`figure` uses `\columnwidth`.

## Type and line minimums (at final size)

- Axis labels and tick labels: **≥ 7 pt** (Nature allows 5–7 pt; below 5 pt
  is a desk reject at several venues). The prism style targets 7–8 pt.
- Panel letters: bold, 8–9 pt, lowercase (`a`, `b`, `c`…) unless the venue
  says otherwise (some want uppercase or parentheses — check).
- Lines: ≥ 0.5 pt after scaling; hairlines below 0.25 pt can vanish in print.
- Sans-serif (Arial/Helvetica) is required by Nature/Science; serif is fine
  for most CS venues — match the manuscript, one family per paper.

## File formats and resolution

- **Vector (PDF/EPS) for everything with lines or text.** Raster only for
  genuine images (photos, micrographs, dense heatmaps).
- Raster minimums: 300 dpi (color/gray), 600 dpi (combination line+image),
  900–1200 dpi (pure line art if raster is unavoidable).
- Never JPEG for line art or text — compression halos are instantly visible.
- Embed fonts: `pdf.fonttype: 42` (TrueType, editable) is in the prism
  style; Type 3 bitmap fonts are rejected by many submission systems.

## Multi-panel mechanics

- One figure file per manuscript figure — panels composed in the script
  (`plot_multipanel.py`), not in PowerPoint afterward.
- Shared colorbar: one per figure when panels share a quantity, placed on
  the grid (`fig.colorbar(im, ax=ax, …)`), sized to its panel.
- Panel aspect: keep related panels the same height; align x-axes when
  panels share a quantity (`sharex=True` when honest).
- Gutter: ~1–2 mm between panels at final size; tighter reads as one panel,
  wider wastes the column.
