# Chart Selection

Pick the chart by the comparison the reader must make — not by habit.

## By data shape

| You want to show | Use | Script | Not |
|---|---|---|---|
| Distribution of one variable | histogram / ECDF / violin | `plot_box_violin.py` | bar of means |
| Group comparison (few groups) | box/violin + box | `plot_box_violin.py` | bars alone ("dynamite plots" hide n) |
| Trend over ordered x | line with CI band | `plot_timeseries_ci.py` | bars |
| Two-variable relationship | scatter (+ regression line if claimed) | `plot_scatter_fit.py` | line through categorical x |
| Grouped scores with error | grouped bar + yerr | `plot_grouped_bar.py` | dynamite without n |
| Matrix / pairwise structure | heatmap with stated color scale | `plot_heatmap.py` | 3-D anything / `jet` |
| Classifier trade-off | ROC and PR | `plot_roc_pr.py` | a remembered curve |
| Uncertainty | error bars / bands with the estimator named in the caption | the matching script above | unlabeled whiskers |

## Rules that catch review comments

- **Bars start at zero.** If you truncate, use points/lines and say why.
- **Log scale**: only for multiplicative/orders-of-magnitude data; label the
  axis as log and keep ticks at powers of ten.
- **Error bars**: the caption must state what they are — SD, SEM, or 95% CI,
  and n per group. SEM bars exist to look small; prefer CI.
- **n visible**: for group comparisons, show the points or state n in the
  caption.
- **Aspect ratio**: slopes read as effect sizes; do not stretch to dramatize.
- **Direct labeling** beats a legend when there are ≤ 5 series.

## Before declaring done

- Legible at final column width (print at 100% and check)
- Units on every axis
- Colorblind-safe palette (see `colorblind-palettes.md`)
- Caption states what the figure *shows* (the finding), not only what it is
