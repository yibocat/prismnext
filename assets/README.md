# Public README media

Assets referenced by the root `README.md` / `README.zh-CN.md` and the [download site](../website/).

## Brand & cover

| File | Use |
| --- | --- |
| `readme-cover.png` | English README cover — the download site's "living preprint" style (paper sheet on a desk, wireframe manifold, journal stamp) |
| `readme-cover-zh.png` | 中文 README 封面 — 同版式的中文变体 |
| `app-icon.png` | Standalone app icon (light tile) |
| `app-icon-dark.png` | Dark-tile icon variant — used on the covers and the website header |
| `ribbon.svg` | Brand ribbon mark |
| `research-loop.svg` / `research-loop-zh.svg` | Product loop diagram (manuscript style) |

The covers are rendered from one HTML template (same visual language as the site, `?lang=en|zh` variants) via headless Chrome:

```bash
./scripts/readme-media/generate-readme-cover.sh   # cover.html -> readme-cover.png + readme-cover-zh.png (2400x720)
```

Edit `scripts/readme-media/cover.html` to change copy, layout, or the manifold figure.

## Screenshots

| Folder | Contents |
| --- | --- |
| `screenshots-2/<area>/` | Source captures — nine product areas, each in five theme packs × light/dark PNG |
| `shots/` | README tour shots — per-area light/dark webp pairs (referenced via `<picture>` so they follow the reader's GitHub theme), plus `interactive.webp` |

The website shot build converts the `screenshots-2/` PNGs into themed, transparent-background webp for the download site:

```bash
./scripts/readme-media/build-web-shots.sh   # screenshots-2/ -> website/assets/shots/
```

The `shots/` README pairs are copied from that build's output (`website/assets/shots/`).

## How app backdrops work (for context)

In the Electron app, chat-home backdrops are **drawn**, not screenshots:

- `academic` — SVG with math / physics / chem motifs (`home-backdrops/academic.tsx`)
- `paperplane` / `forest` / `ink` / `rain` / `starfield` — Canvas / SVG scenes
- Theme packs — CSS token palettes (`theme-packs.ts`)

The website (`website/backdrops.js`) and the README covers reuse the same drawn style.
