# Tray icons

macOS menu-bar / system-tray — **rounded square + variant A ribbon** (template mono).
Fixed corner radius (not wired to Appearance — a 16px extra cannot show that slider).

## Composition

- Rounded rect (inset 2 in viewBox 64), then ribbon strokes on top (**not** knockout)
- Optical: lighter plate (~0.35) + near-full-slot ribbon (`scale ≈ 0.98`) for menu-bar weight
- Status (`idle` / `busy` / `attention`): **same plate**; ribbon opacity + stroke weight only
- Black + alpha, no brand color, no D2

## Sizing

| File | Pixels |
|------|--------|
| `*Template.png` | **16×16** |
| `*Template@2x.png` | **32×32** |

Electron’s recommended menu-bar size. Using 22–32 as **1x** makes the status item chrome larger than neighboring apps.

## Interaction

On macOS the menu is a native status-item context menu (opens on **mouse-down**, second click dismisses). Do not also `popUpContextMenu` on `click` — that races the system and feels sticky. Windows / Linux still open on click via `popUpContextMenu`.

## Regenerate

```bash
cd resources/tray
for name in idleTemplate busyTemplate attentionTemplate; do
  rsvg-convert -w 16 -h 16 "${name}.svg" -o "${name}.png"
  rsvg-convert -w 32 -h 32 "${name}.svg" -o "${name}@2x.png"
done
```
