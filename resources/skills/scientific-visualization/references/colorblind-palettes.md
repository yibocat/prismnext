# Colorblind-Safe Palettes

~4% of readers cannot distinguish red/green. Use these hex values — they are
the verified ones, do not approximate.

## Okabe-Ito (default categorical, up to 8)

| Name | Hex |
|---|---|
| blue | `#0072B2` |
| orange | `#E69F00` |
| bluish green | `#009E73` |
| vermillion | `#D55E00` |
| reddish purple | `#CC79A7` |
| sky blue | `#56B4E9` |
| yellow | `#F0E442` |
| black | `#000000` |

Rules: yellow and sky blue are low-contrast on white — use them last; for
two-series figures use blue/vermillion, not blue/orange, when one series is
"ours vs baseline" (vermillion draws the eye to the contrast).

## Paul Tol qualitative (when you need more)

- bright: `#4477AA` `#EE6677` `#228833` `#CCBB44` `#66CCEE` `#AA3377` `#BBBBBB`
- muted: `#332288` `#88CCEE` `#44AA99` `#117733` `#999933` `#DDCC77` `#CC6677` `#882255` `#AA4499`

## Sequential / diverging

- Sequential: `cividis` or `viridis` (matplotlib built-ins — perceptually
  uniform, print-safe). Never `jet`.
- Diverging (centered data): `RdBu_r` or Tol's `#2166AC` → `#F7F7F7` → `#B2182B`;
  always state the center value in the caption.

## Grayscale survival test

Print the figure in grayscale (or toggle a simulator). If two series merge,
differentiate with line style / markers, not more colors.
