# TeX Workspace Export Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Toolbar export menu: save compiled PDF; zip manuscript sources (no compile PDF).

**Architecture:** Main-process IPC shows save dialog and writes files. Toolbar menu triggers actions. Zip via `fflate` (or equivalent) walking the manuscript directory with excludes.

**Tech Stack:** Electron `dialog.showSaveDialog`, Node `fs`, `fflate` for zip.

---

## File map

| File | Role |
|------|------|
| `src/main/services/manuscript-export.ts` | Resolve compile PDF path; walk+zip manuscript |
| `src/main/ipc/compile.ts` (or manuscript.ts) | `compile:exportPdf`, `manuscript:packZip` handlers |
| `src/preload/index.ts` + `electron.d.ts` | Expose APIs |
| `texworkspace-toolbar.tsx` | Export AppMenu |
| i18n `en` / `zh-CN` / `zh-HK` | Labels |
| `tests/main/manuscript-export.test.ts` | Exclude rules + path helpers |

---

## Tasks

- [x] Add `fflate` dependency
- [x] Implement `manuscript-export.ts` helpers + unit tests for excludes / stem path
- [x] Wire IPC + preload types
- [x] Toolbar Export menu + toasts
- [x] i18n strings
- [ ] Manual smoke: export PDF, pack zip, verify no `.prismnext/compile` in zip
