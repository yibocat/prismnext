# Literature Integration Plan

> **Goal:** Connect the project literature library with Files, Browser, TeX workspace, and Agent/Chat so reading, notes, citing, and AI context form one workflow.

**Status:** Phase 1 ✅ · Phase 2 ✅ · Phase 3 pending (2026-06-30).

**Related specs/plans:**
- `docs/superpowers/specs/2026-06-29-literature-reader-design.md`
- `docs/superpowers/plans/2026-06-30-native-literature-independence.md`

---

## Architecture snapshot

```
library.db (.prismnext/library/)     ← Literature mode, Agent tools, @paper
references.bib (project root)        ← TeX compile, \cite{}
notes/ (workspace notebook dir)      ← Reading notes (Markdown + frontmatter)
```

| Module | Integration status | Entry point |
|--------|-------------------|-------------|
| Files | Phase 1 | `workspaceDirs` notebook + `create-paper-note.ts` |
| Browser | Phase 1 (fix) | `openUrlInBrowser()` / `AppBrowserLink` |
| TeX workspace | Phase 3 | `LatexEditor` cite autocomplete + `literatureCite` IPC |
| Agent / Chat | Phase 2 | `@paper`, `paper-snippet`, literature tools |

---

## Phase 1 — Files notebook + Browser fix

**Goal:** Dedicated reading-notes directory; one-click note from literature entry; consistent in-app link opening.

### 1.1 Default notebook directory

| Task | File(s) | Notes |
|------|---------|-------|
| Add `DEFAULT_NOTEBOOK_DIR = "notes"` | `src/renderer/types/workspace.ts` | Alongside `DEFAULT_MANUSCRIPT_DIR` |
| Add `findNotebookConfig()` / `resolveNotebookDir()` | `src/renderer/types/workspace.ts` | First `notebook` in `workspaceDirs`, fallback `notes` |
| Include notebook in `defaultWorkspaceDirs()` | `src/renderer/types/workspace.ts` | New projects get `manuscript` + `notes` |
| Sync app settings default | `src/renderer/stores/settings-store.ts` | Match `defaultWorkspaceDirs()` |
| New project creates folders | existing `workspace:createFolders` | No IPC change — template already drives mkdir |

**Acceptance:** New project has `notes/` on disk and in Workspace settings.

### 1.2 Paper note helper (per-paper folder)

| Task | File(s) | Notes |
|------|---------|-------|
| `paperNoteDirName` / `listPaperNotes` | `src/renderer/lib/literature/paper-notes.ts` | One folder per paper; list folder + legacy flat `.md` |
| `createNewPaperNote` | `create-paper-note.ts` | Always `{date}-note.md` in `notes/{bibkey}/` |
| `LiteraturePaperNotesSection` | `literature-paper-notes.tsx` | Entry panel lists all notes + empty state |
| Notes → Literature | `literature-note-link.tsx` + `MarkdownToolbar` | **Open in Literature** when frontmatter has `paper_id` |
| Agent `@paper` | `compile-composer-prompt.ts` | Injects reading note file paths |
| Agent `@file` note | `compile-composer-prompt.ts` | **Notes linked to literature** section |

**Structure:**

```
notes/
  vaswani2017attention/
    2026-06-30-note.md
    2026-06-30-note-2.md
```

**Frontmatter:** `paper_id`, `bibkey`, `title`, `authors`, `doi`, `arxiv`, `created`

### 1.3 Literature entry panel — "New note"

| Task | File(s) | Notes |
|------|---------|-------|
| Add button | `literature-entry-panel.tsx` | Next to Open PDF / Edit; icon `NotebookPenIcon` or `FilePlusIcon` |
| On click | `createOrOpenPaperNote` | Activate Files mode + open note tab |

**Acceptance:** Click "New note" → markdown opens in Files mode with frontmatter filled.

### 1.4 Files sidebar — notebook badge

| Task | File(s) | Notes |
|------|---------|-------|
| Map top-level folder → `FolderFunction` | `files-sidebar.tsx` | From `workspaceDirs` |
| Optional badge on folder row | `virtual-tree-rows.tsx` | Emoji from `FOLDER_FUNCTION_ICONS` |

**Acceptance:** `notes/` shows 📓 badge in file tree (when configured as notebook).

### 1.5 Browser — markdown preview links

| Task | File(s) | Notes |
|------|---------|-------|
| Replace native `<a>` for http(s) | `markdown-preview.tsx` | Use `AppBrowserLink` (match `markdown-document-preview.tsx`) |

**Why:** Native `<a href="https://…">` opens the OS browser; rest of app uses in-app Browser tab.

**Acceptance:** Click link in editor Markdown preview → in-app Browser tab.

### Phase 1 verification

```bash
cd prism-next
pnpm test tests/renderer/literature-format.test.ts tests/renderer/workspace-template.test.ts
pnpm test tests/renderer/create-paper-note.test.ts   # after added
npx tsc --noEmit
```

Manual:
1. New project → `notes/` exists
2. Literature entry → New note → md file opens
3. Second click → same file opens (no duplicate)
4. Files tree → `notes` has notebook badge
5. Markdown preview external link → Browser tab

---

## Phase 2 — Agent / Chat @ literature

**Goal:** `@paper` works without opening Literature mode first; Reader excerpts go to Chat.

### 2.1 Preload papers on project open

| Task | File(s) |
|------|---------|
| Call `literatureList` when `projectRoot` set | `document-store.ts` openProject path, or `use-chat-composer.ts` |
| Avoid blocking UI | Fire-and-forget into `literature-store.refresh` |

### 2.2 Fix @ dropdown reactivity

| Task | File(s) |
|------|---------|
| Subscribe `papers` in `mentionOptions` useMemo deps | `inline-composer-editor.tsx` |

### 2.3 Enrich `@paper` prompt

| Task | File(s) |
|------|---------|
| Include title, year, first author in Literature context block | `compile-composer-prompt.ts` |
| Optional hint: use `literature-read` for full text | same |

### 2.4 Reader → Chat (paper-snippet)

| Task | File(s) |
|------|---------|
| `insertPaperToChat()` | `src/renderer/lib/chat/insert-to-chat.ts` |
| "Add to Chat" on text selection / highlight | `literature-reader.tsx` |

**Acceptance:** Open project → `@` shows papers; PDF selection → composer gets paper-snippet token.

---

## Phase 3 — TeX workspace cite loop

**Goal:** Write `\cite{}` from library; autocomplete; cite consistency check.

### 3.1 `\cite{}` autocomplete

| Task | File(s) |
|------|---------|
| New `cite-autocomplete.ts` | `src/renderer/lib/literature/` |
| Mount on `LatexEditor` | `src/renderer/components/modules/editor/index.tsx` |
| Data: `library.db` papers ∪ project `.bib` keys | dedupe by bibkey |

### 3.2 "Cite in manuscript" button

| Task | File(s) |
|------|---------|
| IPC `literatureCite` then `requestInsertText("\\cite{bibkey}")` | `literature-entry-panel.tsx` |
| Guard: active file must be `.tex` | toast if not |

### 3.3 Cite consistency check UI

| Task | File(s) |
|------|---------|
| IPC `literature:citeCheck` | `src/main/ipc/literature.ts` (wrap existing `citeCheckLiterature`) |
| Show missing/unused in TeX sidebar | `texworkspace-sidebar.tsx` or compile problems |

**Acceptance:** Type `\cite{` → suggestions; entry panel inserts cite + updates `.bib`; sidebar warns missing keys.

---

## Phase 4 — Optional polish

| Item | Module | Notes |
|------|--------|-------|
| SyncTeX bidirectional UI | TeX + Preview | `compileSynctex` / `compileSynctexForward` wiring |
| `.bib` syntax highlighting | Editor | `language-mappings.tsx` |
| Literature tool widgets | Chat | Dedicated read/search/cite widgets |
| `paper` token variant | Composer | Amber BookOpen chip |
| Note backlinks in entry panel | Literature | Scan `notes/` for matching `bibkey` in frontmatter |
| BBT install link → app Browser | Literature | Optional consistency |

---

## Execution order

```
Phase 1 (Files + Browser fix)     ← current
  ↓
Phase 2 (Agent @ literature)
  ↓
Phase 3 (TeX cite loop)
  ↓
Phase 4 (as needed)
```

**Git:** Do not auto-commit. User commits at phase boundaries when ready.

---

## Key files index

| Domain | Path |
|--------|------|
| Workspace types | `src/renderer/types/workspace.ts` |
| Paper note helper | `src/renderer/lib/literature/create-paper-note.ts` |
| Entry panel | `src/renderer/modes/literature-mode/literature-entry-panel.tsx` |
| Files sidebar | `src/renderer/modes/files-mode/files-sidebar.tsx` |
| Browser link | `src/renderer/lib/browser-link/open-in-browser.ts` |
| Cite autocomplete (Phase 3) | `src/renderer/lib/literature/cite-autocomplete.ts` |
| Composer prompt | `src/renderer/components/modules/chat/inline-composer/compile-composer-prompt.ts` |
| LatexEditor | `src/renderer/components/modules/editor/index.tsx` |
