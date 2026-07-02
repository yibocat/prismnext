# Literature Citation Network — Implementation Plan

> **Spec:** [2026-07-02-literature-citation-network-design.md](../specs/2026-07-02-literature-citation-network-design.md)

## Steps

1. **Shared types** — `src/shared/paper-citation-network.ts`
2. **Main service** — `src/main/services/literature-citation-network.ts` (OpenAlex + file cache)
3. **IPC** — handlers in `src/main/ipc/literature.ts`
4. **Preload + types** — `preload/index.ts`, `electron.d.ts`
5. **UI** — `literature-sidebar-citations.tsx`, wire into `literature-sidebar-paper.tsx`
6. **Tests** — `tests/main/literature-citation-network.test.ts`
7. **Verify** — `pnpm test` filtered + `tsc --noEmit`

## File homes (per repo rules)

| Concern | Home |
|---------|------|
| Types + constants | `src/shared/paper-citation-network.ts` |
| OpenAlex fetch + cache | `src/main/services/literature-citation-network.ts` |
| IPC | extend `src/main/ipc/literature.ts` |
| Sidebar UI | `src/renderer/modes/literature-mode/literature-sidebar-citations.tsx` |

No new IPC domain file — citations are literature-scoped.
