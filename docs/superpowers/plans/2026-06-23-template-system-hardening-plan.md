# Template System Hardening — Implementation Plan

**Date:** 2026-06-23  
**Spec:** [2026-06-23-template-system-hardening-design.md](../specs/2026-06-23-template-system-hardening-design.md)

## Checklist

### Phase 1 — Foundation

- [x] `src/renderer/lib/templates/project-template-state.ts` — load/save `settings.json.template`
- [x] `src/renderer/hooks/use-project-template.ts` — hook with loading + reload
- [x] Export from `src/renderer/lib/templates/index.ts`

### Phase 2 — Apply pipeline

- [x] `getTemplateSwitchStrategy` in `template-merge.ts`
- [x] `supportsSectionMerge(category)` helper
- [x] `src/renderer/lib/templates/apply-template-flow.ts` — full state machine
- [x] `clearPdfCache` after successful apply

### Phase 3 — Merge

- [x] Preamble block merge in `mergeSections`
- [x] Index-based section replacement (no `String.replace` on raw)
- [x] `template-switch-dialog.tsx` — strategy-driven actions/messages

### Phase 4 — IPC

- [x] `src/main/lib/template-path.ts` — `assertSafeRelativePath`
- [x] Staging apply in `template:apply`
- [x] Backup manifest extensions
- [x] `template:restoreBackup` metadata restore
- [x] `template:get` parse guard

### Phase 5 — UI

- [x] Refactor `template-center.tsx`
- [x] `template-gallery.tsx` / `template-detail.tsx` — gates + useMemo fix
- [x] `template-sidebar.tsx` — remove fake dates
- [x] `texworkspace-settings.tsx` — `useProjectTemplate`
- [x] `left-main-area.tsx` — remove `onUseTemplate`

### Phase 6 — Tests

- [x] `tests/renderer/template-merge.test.ts` (15+ cases)
- [x] `tests/renderer/project-template-state.test.ts`
- [x] `tests/main/template-path-safety.test.ts`
- [x] `npx tsc --noEmit` + vitest

## Verification

1. Open project without manuscript → Use disabled
2. Apply academic-paper on clean project → files in manuscript, settings updated
3. Edit abstract only → switch to phd-thesis merge → abstract preserved
4. Apply letter → switch to paper → replace only (no merge button)
5. Restore backup → Settings shows correct template id
6. Rapid Use click before load → button disabled
