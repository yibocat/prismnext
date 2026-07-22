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
| `app-icon-light.svg` / `app-icon-dark.svg` | App icon masters (1024); mark `scale(15)` for Dock weight |
| `app-icon-light.png` / `app-icon-dark.png` | 1024 PNG exports |
| `icon.icns` | macOS Dock / About (electron-builder) |
| `icon.ico` | Windows (electron-builder) |
| `../tray/*Template.svg` | Menu bar (16 / @2x 32, mono, A silhouette) |

## Regenerate PNGs + macOS/Windows icons
```bash
cd resources/brand
rsvg-convert -w 1024 -h 1024 app-icon-light.svg -o app-icon-light.png
rsvg-convert -w 1024 -h 1024 app-icon-dark.svg -o app-icon-dark.png
cp app-icon-dark.png icon.png
# macOS: iconutil iconset (16…1024) → icon.icns
# Windows: multi-size ICO with a **256×256** frame (electron-builder rejects 16-only .ico)
python3 <<'PY'
from pathlib import Path
import struct
from io import BytesIO
from PIL import Image

master = Image.open("app-icon-dark.png").convert("RGBA")
sizes = [16, 24, 32, 48, 64, 128, 256]
entries = []
for s in sizes:
    buf = BytesIO()
    master.resize((s, s), Image.Resampling.LANCZOS).save(buf, format="PNG")
    entries.append((s, buf.getvalue()))
header = struct.pack("<HHH", 0, 1, len(entries))
offset = 6 + 16 * len(entries)
directory = bytearray()
blobs = bytearray()
for s, data in entries:
    w = 0 if s >= 256 else s
    h = 0 if s >= 256 else s
    directory += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
    blobs += data
    offset += len(data)
Path("icon.ico").write_bytes(header + directory + blobs)
print("icon.ico", Path("icon.ico").stat().st_size, "bytes")
PY
```

**Do not** save `icon.ico` with a single 16×16 frame — Windows packaging fails with `Icon must be at least 256x256`.
