# TeX Workspace Export Design

**Date:** 2026-07-17  
**Status:** Approved

## Summary

Add two export actions to the TeX Workspace toolbar:

1. **Export compiled PDF** — save the current compile output PDF via the system save dialog.
2. **Pack manuscript** — zip the configured manuscript folder (source only; **no** compiled PDF).

## UX

- Toolbar (compile cluster): an **Export** `AppMenu` trigger (icon button + hint).
- Menu items:
  - 导出编译 PDF… / Export compiled PDF…
  - 打包 manuscript… / Pack manuscript…
- No intermediate business dialog. Each item opens `dialog.showSaveDialog`, then runs.
- Errors/success: toast (missing PDF → ask user to compile first; missing manuscript → configure workspace).

### Default filenames

| Action | Default path name |
|--------|-------------------|
| PDF | `<projectName>-<stem>.pdf` |
| Zip | `<projectName>-manuscript.zip` |

## Semantics

### Export PDF

- Source: `<projectRoot>/.prismnext/compile/<stem>.pdf` (same stem as compile target), falling back to in-memory compile cache bytes if the file is missing but cache has data.
- If neither exists → toast, no dialog.
- Does not recompile automatically.

### Pack manuscript

- Source directory: workspace manuscript folder (`manuscriptConfig.dir` under project root).
- Zip **entire directory tree** of that folder.
- **Exclude:**
  - `.git`, `.DS_Store`, `Thumbs.db`
  - TeX intermediates: `.aux`, `.log`, `.out`, `.toc`, `.lof`, `.lot`, `.fls`, `.fdb_latexmk`, `.synctex.gz`, `.bbl`, `.blg`, `.bcf`, `.run.xml`, `.nav`, `.snm`, `.vrb`, `.xdv`
  - Any nested `.prismnext/`
  - Compiled PDFs under the manuscript tree (`*.pdf` that live only as build artifacts are excluded only if we also exclude all `*.pdf` — **decision:** exclude `*.pdf` from the zip so submitters do not accidentally ship a stale PDF; PDF export is the dedicated path)
- **Do not** include `.prismnext/compile/` output.

> Note: Excluding all `*.pdf` means figure PDFs under `figures/*.pdf` would also be excluded. Prefer excluding only top-level / known build PDFs matching the main stem, **or** exclude `.prismnext` only and allow figure PDFs.

**Revised exclude (product):**

- Exclude: VCS junk, TeX aux list above, `.prismnext/`
- **Keep** `*.pdf` that live inside manuscript (figures often are PDF).
- Do **not** pull in `.prismnext/compile/`.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `texworkspace-toolbar.tsx` | Export menu; invoke preload APIs; toasts |
| Main IPC `compile:exportPdf` / `manuscript:packZip` | Resolve paths, save dialog optional from renderer or main |
| Main service helpers | Copy PDF bytes; walk + zip manuscript |

**Dialog ownership:** Renderer calls a dedicated IPC that either (a) shows save dialog in main then writes, or (b) renderer asks for save path then passes absolute path. Prefer **(a)** single round-trip: `compile:exportPdf({ projectRoot, mainFile })` → dialog + write → `{ ok, canceled, path? }`.

Same for `manuscript:packZip({ projectRoot, manuscriptDir })`.

## i18n

Keys under `modes.texworkspace`: `exportMenu`, `exportPdf`, `packManuscript`, success/error strings.

## Out of scope

- Minimal dependency closure via `\input` / `\includegraphics` analysis
- Including compile PDF inside the zip
- Email / Overleaf upload
