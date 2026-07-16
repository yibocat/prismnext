# prismnext Brand System

**Status:** locked — **variant A**  
**Default palette:** P5 Warm Graphite  
**Mark:** Fork ribbon (matched bends, upper over lower)

## Mark (variant A)

| Rule | Value |
|------|--------|
| Variant | **A** (Canvas-approved; topology / 3D-torsion explorations rejected) |
| Geometry | Dual band; upper paints after lower |
| Paths | `RIBBON_UPPER_D` / `RIBBON_LOWER_D` in `src/shared/brand-mark.ts` |
| Caps | `strokeLinecap="round"` |
| Stroke (UI) | 7.2 |
| Optical scale (UI) | 1.18 |
| Depth | D2 offset drop shadow only — **no gloss** |
| React | `src/renderer/components/brand/prism-ribbon-mark.tsx` |

## Color (surface-based schemes)

### P5 Warm Graphite (default)

| Role | Light surface | Dark surface |
|------|---------------|--------------|
| Face (upper) | `#2C2825` | `#F5EDE4` |
| Under (lower) | `#C9853E` | `#E8A85A` |

Palettes `p1`–`p6` remain in `BRAND_PALETTES`.  
Theme: only `resolvedTheme === "dark"` → dark mark (`resolveBrandSchemeFromTheme`).

## Usage matrix

| Surface | Color | Shadow | Scale / size | Assets |
|---------|-------|--------|--------------|--------|
| In-app UI | Palette + scheme | D2 on | 7.2 / 1.18 | `PrismRibbonMark` |
| Welcome plate | Same; plate = `bg-card` (not inverted foreground) | D2 on | UI mark | welcome-page |
| Tray / menu bar | Black + alpha | Off | Solid circle + A ribbon on top · **16 / @2x 32** | `resources/tray/` (see tray-circular-mark spec) |
| App icon | P5 on plate | D2 on | 1024 + `icon.icns` / `icon.ico` | `resources/brand/` |

## Wordmark

**prismnext** — UI font; do not fold the ribbon into letterforms.

## Do not

- Specular gloss as a brand requirement
- Triangle / prism facets
- Two ribbons braiding / topology knots as the product mark
- Shipping 32×32 as Tray 1x (inflates the menu-bar button)
- Putting the mark on `bg-foreground` (inverts light/dark colors)

## Related

- Source of truth: `src/shared/brand-mark.ts`
- Brand canvas: project `canvases/prism-brand-system.canvas.tsx`
- Asset notes: `resources/brand/README.md`
