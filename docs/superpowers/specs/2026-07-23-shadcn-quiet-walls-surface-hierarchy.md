# Shadcn-style quiet walls + surface hierarchy

**Date:** 2026-07-23  
**Status:** Implemented

## Why shadcn “always looks good”

Their theme builder is **Base + Theme**, not “paint every role a different loud hue”:

| Role | Shadcn default pattern |
|------|-------------------------|
| `--background` | Quiet canvas (often slightly gray) |
| `--card` | ≈ pure white — lift vs canvas |
| `--muted` / `--secondary` / `--accent` | **Nearly the same** pale gray (`oklch(0.97 …)`), whisper tint at most |
| `--primary` | **Only** saturated brand CTA |
| Charts | Separate `--chart-*` (where multi-hue “搭配” lives) |
| `--radius` | ≈ `0.625rem` |

Loud companion fills on `--accent` (sand/cyan/amber wash) make soft chrome look dirty. Soft fills must stay near-muted.

## Prism mapping

| Surface | Token |
|---------|--------|
| Shell | `--background` (L≈0.97, C≤0.006) |
| Toolbar / Editor / AiBar capsule | `--card` (L=1 light) |
| PDF well | `--muted` |
| Soft hover / New worktree | `--accent` ≈ muted gray |
| Buttons / links | `--primary` Brand |

## Packs

Same five IDs; each = quiet base hue whisper + one Brand primary. Chart scheme carries series color variety.
