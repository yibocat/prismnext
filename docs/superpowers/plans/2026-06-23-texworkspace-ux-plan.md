# TexWorkspace UX Polish — Implementation Plan

> **Goal:** Full manuscript file tree, Problems pane in preview slot, cleaner toolbar/sidebar.

**Spec:** `docs/superpowers/specs/2026-06-23-texworkspace-ux-design.md`

## Tasks

- [x] `parse-latex-log.ts` + unit tests
- [x] `texworkspaceRightPane` in layout-store
- [x] `CompileProblemsPanel` + `right-main-area` wiring
- [x] Auto pane switch in `use-texworkspace.ts`
- [x] Sidebar: manuscript tree, remove Compile tab
- [x] Toolbar: PDF/Problems toggles, remove backup

## Verify

```bash
cd prism-next && pnpm test tests/renderer/parse-latex-log.test.ts
cd prism-next && npx tsc --noEmit
```
