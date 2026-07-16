# prismnext brand mark

**Locked variant: A** (fork ribbon — matched bends, upper over lower).

## Mark
- Geometry: A paths in `src/shared/brand-mark.ts`
- Stroke ≈ 7.2 · UI scale ≈ 1.18 · D2 shadow · **no gloss**
- Round caps; endpoints inset so caps are not clipped
- React: `src/renderer/components/brand/prism-ribbon-mark.tsx`
- Spec: `docs/superpowers/specs/2026-07-17-brand-system.md`

## Default color — P5 Warm Graphite
| Surface | Face (upper) | Under (lower) |
|---------|--------------|---------------|
| Light | `#2C2825` | `#C9853E` |
| Dark | `#F5EDE4` | `#E8A85A` |

Schemes name the **surface**. P1–P6 remain swappable.

## Assets
| File | Use |
|------|-----|
| `ribbon-p5-light.svg` / `ribbon-p5-dark.svg` | Color mark alone |
| `app-icon-light.svg` / `app-icon-dark.svg` | App icon masters (1024) |
| `app-icon-light.png` / `app-icon-dark.png` | 1024 PNG exports |
| `icon.icns` | macOS Dock / About (electron-builder) |
| `icon.ico` | Windows (electron-builder) |
| `../tray/*Template.svg` | Menu bar (16 / @2x 32, mono, A silhouette) |

## Regenerate PNGs
```bash
cd resources/brand
rsvg-convert -w 1024 -h 1024 app-icon-light.svg -o app-icon-light.png
rsvg-convert -w 1024 -h 1024 app-icon-dark.svg -o app-icon-dark.png

cd ../tray
for name in idleTemplate busyTemplate attentionTemplate; do
  rsvg-convert -w 22 -h 22 "${name}.svg" -o "${name}.png"
  rsvg-convert -w 44 -h 44 "${name}.svg" -o "${name}@2x.png"
done
```
