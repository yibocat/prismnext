# Tray circular mark

**Status:** implemented  

**App name:** prismnext  
**Date:** 2026-07-17

## Problem

The current menu-bar tray glyph is variant A ribbon alone. At 16pt it reads thin: open fork, lots of negative space, weak next to solid neighboring status items.

## Decision

**Solid circle + ribbon on top (option C).**  
Status differentiation by **ribbon opacity / weight only** (option 2) — circle stays constant.

## Visual rules

| Rule | Value |
|------|--------|
| Geometry | Locked variant A paths (`RIBBON_UPPER_D` / `RIBBON_LOWER_D` in `src/shared/brand-mark.ts`) |
| Container | Filled circle, ~full slot (viewBox 64, radius ≈ 30, tiny inset) |
| Composition | Circle painted first; ribbon strokes on top (**not** knockout / cutout) |
| Color | Template black + alpha only — no brand palette, no D2 shadow |
| Size | `*Template.png` **16×16**, `*Template@2x.png` **32×32** (do not ship larger 1x) |
| Optical | Lighter disk (~0.35 alpha) + ribbon `scale ≈ 0.98`, heavier stroke — figure/ground contrast over packing the mark small inside the disk |

## Status variants

Same circle for all three. Only the ribbon changes:

| State | Circle | Ribbon |
|-------|--------|--------|
| `idle` | Solid, stable alpha | Upper / lower distinct alphas (depth readable) |
| `busy` | Unchanged | Overall lighter / slightly thinner (“working”) |
| `attention` | Unchanged | Overall heavier / slightly thicker (“needs you”) |

No extra ring, badge, or shape change for attention.

## Assets & code

| Path | Role |
|------|------|
| `resources/tray/idleTemplate.svg` (+ png / @2x) | Idle |
| `resources/tray/busyTemplate.svg` (+ png / @2x) | Busy |
| `resources/tray/attentionTemplate.svg` (+ png / @2x) | Attention |
| `src/main/services/tray.ts` | Load / status mapping — keep; no API change expected |
| `resources/tray/README.md` | Document circular composition + regenerate commands |

Interaction rules unchanged: no persistent `setContextMenu` on macOS; menu on mouse-up via `popUpContextMenu`.

## Out of scope

- Colored tray icons
- Changing Dock / app icon (`resources/brand/`)
- Changing in-app `PrismRibbonMark` or welcome plate
- Growing tray 1x beyond 16pt

## Related

- Brand lock: `docs/superpowers/specs/2026-07-17-brand-system.md`
- Mark source: `src/shared/brand-mark.ts`
