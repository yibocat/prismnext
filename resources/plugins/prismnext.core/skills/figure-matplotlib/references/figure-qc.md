# Figure QC — pre-submission checklist

Run this pass on every manuscript figure before submission or sharing. It
takes minutes per figure and catches the defects reviewers photograph.

## Geometry & legibility

- [ ] Figure width equals the target column exactly (see
      `journal-sizing.md`); nothing was resized after export.
- [ ] Zoom/print at 100%: every label, tick number, and legend entry is
      legible without squinting (≥ 7 pt at final size).
- [ ] Lines survive: ≥ 0.5 pt at final size; dashed styles distinguishable.
- [ ] Panel letters present, bold, consistently placed; panel order matches
      the caption's reading order.

## Color & rendering

- [ ] Categorical colors come from a colorblind-safe cycle (Okabe-Ito/Tol);
      no red–green or blue–purple-only distinctions carry meaning alone.
- [ ] Color vision deficiency check: view under deuteranopia simulation
      (e.g. colorspacious, or a simulator) — every series still separable;
      line style/marker redundancies exist where color alone would fail.
- [ ] Continuous scales are perceptually uniform (viridis-family), never
      jet/rainbow.
- [ ] Vector format (PDF) for line art; raster only ≥ 300 dpi and only for
      true image content; no JPEG on anything containing text or lines.
- [ ] Fonts embedded (fonttype 42), one family across all figures.

## Content honesty

- [ ] Axes carry quantities **and units**; axis starts are honest (zero for
      counts unless stated; broken axes are marked, not silent).
- [ ] Error bars / bands state what they are on the figure or in the
      caption (std, sem, 95% CI) — and n is given.
- [ ] Sample size / seed count appears on the figure or in its caption.
- [ ] Smoothing, binning, and normalization choices are stated; raw points
      shown when n is small enough to allow it.
- [ ] Every number on the figure traces to a run artifact — the figure
      regenerates from its script with a recorded run id.

## Consistency across the paper

- [ ] Same quantity → same color, same marker, same axis name in every
      figure (a legend read once holds for the whole paper).
- [ ] Same y-range across panels/figures being compared — or a deliberate,
      stated reason why not.
- [ ] Terminology on axes matches the manuscript text (no "loss" on the
      axis vs "objective" in prose).

## Caption & wiring

- [ ] Caption is self-contained: what is plotted, what the reader should
      see, definitions of symbols/error bars/panels.
- [ ] Every panel letter is referenced in the caption or text.
- [ ] `\label` + in-text reference exist; the compiled PDF shows the figure
      at the intended size (`latex-compile` passes, no overfull surprises).

## Common rejection triggers (zero tolerance)

- Screenshot-pasted plots (not script-generated)
- Default matplotlib blue/orange with default fonts at default size
- Jet colormap; red–green encodings
- Legends occluding data; text overlapping markers
- Rasterized line art below 300 dpi
