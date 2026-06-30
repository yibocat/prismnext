# Literature Reader — Split Workspace (PDF ↔ Notes) Plan

> **Goal:** When opening a paper's PDF, show a TeX-style split workspace: PDF on the left, Markdown notes (edit + preview, default edit) on the right, with a paper-scoped sidebar containing the notes file tree and an Annotations list. Do not break TeX workspace.

**Status:** Phase A ✅ · Phase B ✅ · Phase C ✅ · Phase D ✅ (2026-06-30).

**Related:**

- `docs/superpowers/specs/2026-06-29-literature-reader-design.md`
- `docs/superpowers/plans/2026-06-30-literature-integration-plan.md`

---

## 1. Design decisions (confirmed with user)


| Question                        | Decision                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Right pane content              | Markdown notes — **edit + preview**, default **edit**                                                             |
| Sidebar tabs                    | **Notes tree + Annotations** (both in P0)                                                                         |
| Reuse TeX split or reimplement? | **Extract a minimal shared split shell**; TeX keeps its exact behavior, Literature renders through the same shell |
| TeX safety                      | TeX branch stays untouched — same state, same slots, same output; only the panel boilerplate is shared            |


---



## 2. TeX split analysis — what is actually coupled?

`RightMainArea` (`src/renderer/components/layout/right-main-area.tsx`) is the only place that does split today:

```ts
const { isActive, viewMode, switchToFile } = useTexworkspace();   // TeX-only hook
…
if (!isActive) return <RightPane …/>;                             // non-TeX: normal
if (viewMode === "tex") return wrapper(<RightPane …/>);
if (viewMode === "pdf") return wrapper(previewSlot);
return wrapper(<Group>…<Panel>previewSlot</Panel><Separator/><Panel><RightPane/></Panel></Group>);
```

**TeX-specific parts:**

- `useTexworkspace()` active check + `texworkspaceViewMode` (layout-store)
- `previewSlot = problemsOpen ? <CompileProblemsPanel/> : <PdfPreview/>`
- compile-revision → switch-to-texworkspace effect

**Generic parts (already a library):**

- `react-resizable-panels` `Group / Panel / Separator` — mode-agnostic
- The `wrapper` div + `SEP` class

**Conclusion:** There is no "TeX split engine" to extract — the coupling is in *who decides* the slots and *where view-mode lives*. The split JSX itself is ~10 lines of generic primitives.

### Chosen approach: shared shell, per-mode state

Introduce one small presentational component:

```tsx
// src/renderer/components/layout/workspace-split.tsx
export function WorkspaceSplit({ left, right, leftId = "left", rightId = "right", defaultLeft = 60 }: {
  left: ReactNode; right: ReactNode; leftId?: string; rightId?: string; defaultLeft?: number;
}) {
  return (
    <Group orientation="horizontal" className="flex-1 min-h-0" resizeTargetMinimumSize={{ fine: 5, coarse: 5 }}>
      <Panel id={leftId} minSize={150} defaultSize={defaultLeft}>{left}</Panel>
      <Separator id={`sep-${leftId}`} className={SEP} />
      <Panel id={rightId} minSize={150} defaultSize={100 - defaultLeft}>{right}</Panel>
    </Group>
  );
}
```

- **TeX:** `RightMainArea`'s split branch is rewritten to call `<WorkspaceSplit left={previewSlot} right={<RightPane…/>} leftId="pdf" rightId="editor" />`. Output is byte-identical (same ids, same sizes, same separator). TeX state, slots, and the compile-switch effect stay exactly where they are.
- **Literature:** a new branch in `RightMainArea` calls the same shell with `left={<LiteratureReader…/>}` and `right={<LiteratureNotesPane…/>}`.

**Risk to TeX:** minimal — the only change is swapping inline `<Group>/<Panel>/<Separator>` for the equivalent component. Same panel ids preserve resize persistence. A unit/snapshot guard (below) locks the TeX output.

---



## 3. State additions

`layout-store.ts` (parallel to TeX fields — do **not** touch `texworkspaceViewMode`):

```ts
type LiteratureViewMode = "split" | "pdf" | "notes";
literatureViewMode: LiteratureViewMode;          // default "split"
setLiteratureViewMode: (m) => void;
literatureDefaultViewMode: LiteratureViewMode;   // default "split"
setLiteratureDefaultViewMode: (m) => void;
```

`RightTab.literatureView` already exists (`"grid" | "reader" | "notes"`); we keep `"reader"` = the split workspace. The tab's `literaturePaperId` already identifies the paper. No tab-schema change needed.

---



## 4. Component plan



### 4.1 `LiteratureNotesPane` (new)

`src/renderer/modes/literature-mode/literature-notes-pane.tsx`

- Props: `{ paper, projectRoot }`
- Holds the **active note file** (local state, seeded from the most recent note or empty state)
- Renders an **edit / preview toggle** (default **edit**):
  - Edit: reuse `CodeEditor` (markdown) — same editor used by Files mode for `.md`
  - Preview: reuse lazy `MarkdownPreview` bound to the same file
- Empty state: "New note" button → `createNewPaperNote(paper)` then open it
- Receives a selected-note path from the sidebar (via a small shared selector / store slice) so the tree and the pane stay in sync



### 4.2 Paper-scoped sidebar

`LiteratureSidebar` already renders the library/collection tree. Add an internal branch:

```tsx
const activeReaderTab = useRightPanelStore(s => …kind==="literature" && literaturePaperId && literatureView!=="grid"…);
if (activeReaderTab) return <LiteraturePaperWorkspaceSidebar paperId={…}/>;
return <LibraryTreeSidebar/>;   // existing
```

`LiteraturePaperWorkspaceSidebar` (new, `literature-sidebar-paper.tsx`):

- Two tabs at top: **Notes** | **Annotations**
- **Notes tab:** file tree of `notes/{bibkey}/` (reuse `listPaperNotes` + a lightweight tree renderer; New note button)
- **Annotations tab:** list `loadAnnotations(paperId)` — each row: page number, quoted text excerpt, color dot; click → request PDF to jump to page (via `literature-store` `readerFocusPage` nonce + `LiteratureReader` listener)



### 4.3 Toolbar

`LiteratureToolbar` already has a reader variant. Add the **view-mode toggle** (split / pdf / notes) when a paper is open — copy TeX's three-button group visually (`Columns2 / FileText / Eye`), wired to `setLiteratureViewMode`. Keep existing "Add to Chat" / New note actions.

### 4.4 `RightMainArea` branch

Add after the TeX branch, before the default `RightPane` return:

```tsx
const litActive = activeTab?.kind === "literature" && activeTab.literaturePaperId && activeTab.literatureView !== "grid";
if (litActive) {
  const paper = useLiteratureStore.getState().papers.find(p => p.id === activeTab.literaturePaperId);
  if (!paper) return wrapper(<RightPane tabs activeTabId/>);   // fallback
  const left  = <LiteratureReader projectRoot paper/>;
  const right = <LiteratureNotesPane projectRoot paper/>;
  if (literatureViewMode === "pdf")   return wrapper(left);
  if (literatureViewMode === "notes") return wrapper(right);
  return wrapper(<WorkspaceSplit left={left} right={right} leftId="lit-pdf" rightId="lit-notes" defaultLeft={55}/>);
}
```

Non-literature, non-tex → unchanged `<RightPane/>`.

---



## 5. Sidebar ↔ pane sync (selected note)

Avoid a new Zustand store; use a tiny module-level store slice to keep it scoped:

`src/renderer/stores/literature-reader-store.ts` (new, small):

```ts
interface LitReaderState {
  activeNotePathByPaper: Record<string, string | null>;
  readerFocusPageNonce: number;
  readerFocusPage: number | null;
  setActiveNote: (paperId, path) => void;
  requestFocusPage: (page) => void;
}
```

- Sidebar tree sets `setActiveNote(paperId, path)`; `LiteratureNotesPane` reads it.
- Annotations tab calls `requestFocusPage(page)`; `LiteratureReader` listens and scrolls.

(Lives separate from `literature-store` to keep concerns clean; if it grows, fold into literature-store later.)

---



## 6. Files affected


| File                                                 | Change                                                                                                         | TeX risk                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `components/layout/workspace-split.tsx`              | **new** — shared split shell                                                                                   | none                               |
| `components/layout/right-main-area.tsx`              | extract TeX split into `WorkspaceSplit`; add literature branch                                                 | **low** — guarded by snapshot test |
| `stores/layout-store.ts`                             | add `literatureViewMode` + setters                                                                             | none (parallel field)              |
| `stores/literature-reader-store.ts`                  | **new** — note selection + focus page                                                                          | none                               |
| `modes/literature-mode/literature-notes-pane.tsx`    | **new** — edit+preview pane                                                                                    | none                               |
| `modes/literature-mode/literature-sidebar-paper.tsx` | **new** — notes tree + annotations tabs                                                                        | none                               |
| `modes/literature-mode/literature-sidebar.tsx`       | branch to paper sidebar when reader tab active                                                                 | none                               |
| `modes/literature-mode/literature-toolbar.tsx`       | add view-mode toggle for reader                                                                                | none                               |
| `modes/literature-mode/literature-content.tsx`       | reader view now delegates to `RightMainArea` split; keep grid view here                                        | none                               |
| `tests/renderer/right-main-area-split.test.tsx`      | **new** — snapshot/RTL test: TeX split renders `pdf`+`editor` panels; literature renders `lit-pdf`+`lit-notes` | locks TeX behavior                 |


---



## 7. Phased delivery



### Phase A — Split shell + TeX parity (no behavior change)

1. Add `WorkspaceSplit` component
2. Rewrite TeX branch in `RightMainArea` to use it; verify panel ids/sizes identical
3. Add regression test asserting TeX still renders two panels with ids `pdf` / `editor`
4. **Gate:** TeX workspace compile + split + view-mode toggle unchanged (manual + test)



### Phase B — Literature split MVP

1. `literatureViewMode` in layout-store
2. `LiteratureNotesPane` with edit (default) + preview toggle, empty state, New note
3. `RightMainArea` literature branch using `WorkspaceSplit`
4. Toolbar view-mode toggle for reader
5. Wire sidebar: simple notes list (flat) → click opens note in pane

**Acceptance:** Open a paper → PDF left, note right (edit default), toggle to preview, switch split/pdf/notes; create new note from empty state.

### Phase C — Paper sidebar: tree + annotations

1. `literature-reader-store` (selection + focus page)
2. `LiteraturePaperWorkspaceSidebar` with Notes | Annotations tabs
3. Notes tree (folder of `notes/{bibkey}/`), New note button
4. Annotations list → click jumps PDF page; highlight sync
5. `LiteratureSidebar` branch to paper sidebar

**Acceptance:** Sidebar shows only the current paper's notes tree; switching papers switches the tree; Annotations tab lists highlights and jumps to the page.

### Phase D — Polish (post-MVP, optional)

- PDF selection → "Insert into note" (blockquote + page cite)
- Remember last opened note per paper (persist `activeNotePathByPaper`)
- Resize persistence for `lit-pdf` / `lit-notes` panel sizes

---



## 8. TeX safety checklist

- [x] `texworkspaceViewMode` and its setters untouched
- [ ] `useTexworkspace` hook untouched
- [ ] TeX `previewSlot` (PdfPreview / CompileProblemsPanel) untouched
- [ ] Compile-revision → switch effect untouched
- [ ] TeX panel ids stay `pdf` / `editor` (resize state preserved)
- [ ] Regression test: TeX split still produces `pdf` + `editor` panels
- [ ] Manual: open TeX workspace, compile, toggle split/tex/pdf — all behave as before

---



## 9. Open questions (none blocking Phase A/B)

- Notes pane edit/preview toggle UI placement: inside the pane header (local) or in the toolbar? → **local pane header**, keeps toolbar for view-mode.
- Should Annotations tab also allow delete? → P1, not MVP.

