# Tray icons

macOS menu-bar / system-tray — **circular disk + variant A ribbon** (template mono).

## Composition

- Solid circle (`r ≈ 31.5` in viewBox 64), then ribbon strokes on top (**not** knockout)
- Optical: lighter disk (~0.35) + near-full-slot ribbon (`scale ≈ 0.98`) for menu-bar weight
- Status (`idle` / `busy` / `attention`): **same circle**; ribbon opacity + stroke weight only
- Black + alpha, no brand color, no D2

## Sizing

| File | Pixels |
|------|--------|
| `*Template.png` | **16×16** |
| `*Template@2x.png` | **32×32** |

Electron’s recommended menu-bar size. Using 22–32 as **1x** makes the status item chrome larger than neighboring apps.

## Interaction

Do not attach a persistent `tray.setContextMenu` on macOS — the system opens it on **mouse-down**. prismnext opens the menu on **mouse-up** via `popUpContextMenu` only.

## Regenerate

```bash
cd resources/tray
for name in idleTemplate busyTemplate attentionTemplate; do
  rsvg-convert -w 16 -h 16 "${name}.svg" -o "${name}.png"
  rsvg-convert -w 32 -h 32 "${name}.svg" -o "${name}@2x.png"
done
```

Spec: `docs/superpowers/specs/2026-07-17-tray-circular-mark-design.md`
