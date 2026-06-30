# Literature ↔ Zotero Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Replace the mini-Zotero catalog pipeline with Zotero as the source of truth for metadata, collections, citekeys, and PDFs. Prism keeps the reading + annotation + AI + writing surface.

**Architecture:** Zotero local HTTP API (`localhost:23119`) as primary, web API as read-only fallback. `library.db` becomes a Zotero mirror cache (papers + collections carry `zotero_key`). PDFs stream from Zotero `/items/{key}/file` with local cache + version check. Annotations remain Prism-owned. Better BibTeX is the preferred citekey source; without BBT, citekey degrades to Zotero `itemKey`.

**Tech Stack:** pdf.js (existing), `@anaralabs/lector` (existing), better-sqlite3 (existing), new `src/main/services/zotero-client.ts`, Zotero local API + web API, Better BibTeX HTTP endpoints.

---

## Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | BBT | Preferred + compatible fallback. BBT present → stable citekeys + auto-export; absent → `itemKey` as citekey + Zotero native `format=bibtex`, non-blocking banner. |
| 2 | Annotations | Prism-owned (`annotations` table, keyed by `zotero_key`). No read/write of Zotero's own annotations in v1. |
| 3 | Project binding | One Prism project ↔ one Zotero collection. Collection CRUD in Prism writes back to Zotero. |
| 4 | PDF | Local cache at `.prismnext/library/pdf-cache/<zotero_key>.pdf` + version check via Zotero item version. |
| 5 | Connection | Local API primary; web API read-only fallback (list + metadata only, no PDF). |
| 6 | Metadata editing | v1 read-only in Prism; edit in Zotero, refresh in Prism. |
| 7 | `library.db` | Keep as Zotero mirror cache; add `zotero_key`, `source`, `zotero_version`. |
| 8 | Retired code | `literature-enrich.ts`, `bibtex-parse.ts` import path, `download-pdf.ts`, enrich methods in `literature-service.ts` — kept but not called in Zotero mode. |
| 9 | Sync timing | Pull on project open + manual Refresh; no websocket push in v1. |
| 10 | AI v1 | Summarize paper; cite-check (citekey ∈ .bib); draft→citation suggestions. |

---

## File Plan

### New

| Path | Role |
|------|------|
| `src/main/services/zotero-client.ts` | Local + web API client; BBT probe; item/collection/file CRUD; citekey resolver |
| `src/main/services/zotero-sync.ts` | Pull collection → upsert cache; version diffing; PDF cache management |
| `src/main/ipc/zotero.ts` | IPC handlers: connect, probe, pull, collection CRUD, openPdf |
| `src/renderer/components/modules/settings/zotero-settings.tsx` | Global Zotero creds (userID + API key) + connection status |
| `src/renderer/components/modules/literature/zotero-connect-dialog.tsx` | Per-project collection binding picker |
| `src/renderer/lib/literature/zotero-citekeys.ts` | Citekey resolution (BBT → itemKey fallback) for renderer |
| `tests/main/zotero-client.test.ts` | Client unit tests (mocked HTTP) |
| `tests/main/zotero-sync.test.ts` | Sync + cache logic tests |

### Modified

| Path | Change |
|------|--------|
| `src/main/services/literature-service.ts` | Schema migration: add `zotero_key`, `source`, `zotero_version` to `papers`; add `zotero_key` to `collections`; PDF source field. Add Zotero-aware query methods. |
| `src/main/ipc/literature.ts` | `literatureReadPdfBytes` resolves PDF by source: `zotero:attachKey` → stream from Zotero; `local:path` → fs; honor cache. |
| `src/main/ipc/index.ts` | Register `registerZoteroHandlers`. |
| `src/preload/index.ts` + `src/renderer/types/electron.d.ts` | Add `zoteroConnect`, `zoteroProbe`, `zoteroPullCollection`, `zoteroCreateCollection`, `zoteroRenameCollection`, `zoteroDeleteCollection`, `zoteroAddToCollection`, `zoteroRemoveFromCollection`, `zoteroResolveCitekey`, `zoteroExportBib`. |
| `src/main/services/settings.ts` | New settings keys: `zotero.userID`, `zotero.apiKey`, `zotero.lastBBTDetected`. |
| `src/renderer/stores/literature-store.ts` | Add `zoteroStatus` (connected/disconnected/no-bbt), `boundCollectionId`, `pullFromZotero`, `createCollectionInZotero`, etc. Replace enrich-driven actions with Zotero-driven where applicable. |
| `src/renderer/modes/literature-mode/literature-toolbar.tsx` | Add Refresh-from-Zotero button, Connect-to-Zotero entry, BBT-absent banner slot. |
| `src/renderer/modes/literature-mode/literature-sidebar.tsx` | Collections CRUD → call Zotero write-back actions; show Zotero sync state. |
| `src/renderer/modes/literature-mode/literature-entry-panel.tsx` | Metadata read-only (disable Edit fields in Zotero mode); show Zotero source badge; keep Prism-side annotations entry. |
| `src/renderer/modes/literature-mode/literature-reader.tsx` | PDF bytes now come via `literatureReadPdfBytes` which resolves Zotero source internally — reader code unchanged. |
| `src/renderer/lib/literature/cite-autocomplete.ts` | Citekey list source → `zoteroResolveCitekey` results (BBT or itemKey). |
| `src/renderer/lib/literature/extract-doi.ts` | Keep for PDF import fallback (when user adds a PDF not in Zotero). |
| `src/main/services/literature-enrich.ts` | Kept; not called in Zotero mode. Standalone fallback only. |
| `src/main/lib/bibtex-parse.ts` | Kept; used only for non-Zotero BibTeX import. |
| `src/main/lib/download-pdf.ts` | Kept; used only for standalone PDF download. |
| `src/main/prompts/modules/citations.ts` | Add Zotero context: bound collection name, citekey source (BBT/itemKey), .bib location. |
| `src/main/tools/literature-cite.ts` | Tool now reads citekeys from Zotero cache (BBT or itemKey). |
| `.prismnext/settings.json` schema | New project field: `literature.zoteroCollectionId`. |

---

## Task Breakdown

### Phase 1: Zotero client + connection

**Task 1.1 — `zotero-client.ts` skeleton**
- Local API base `http://localhost:23119/api/users/0`
- Web API base `https://api.zotero.org/users/{userID}` with `Zotero-API-Key` header
- Methods: `probeLocal()`, `probeBBT()`, `listCollections()`, `listItemsInCollection(collectionKey)`, `getItem(itemKey)`, `getItemFile(itemKey)` (stream), `createCollection(name, parent?)`, `patchCollection(key, patch)`, `deleteCollection(key)`, `addToCollection(collectionKey, itemKeys[])`, `removeFromCollection(collectionKey, itemKey)`, `resolveCitekeys(itemKeys[])` (BBT or itemKey), `exportBib(itemKeys[], format)`
- BBT probe: `GET /better-bibtex/cayw?probe=true` → 200 = installed
- All HTTP via `fetch` (Node 20+); streaming file via `Response.arrayBuffer()`
- Tests: `tests/main/zotero-client.test.ts` with mocked `fetch`

**Task 1.2 — Settings + IPC + preload**
- `settings.ts`: `zotero.userID`, `zotero.apiKey` (encrypted via electron-store)
- `src/main/ipc/zotero.ts`: `zotero:probe`, `zotero:connect` (validates creds), `zotero:status`
- Register in `ipc/index.ts`
- Preload + `electron.d.ts`: `zoteroProbe`, `zoteroConnect`, `zoteroStatus`
- Settings UI panel `zotero-settings.tsx`: userID + API key inputs, "Test connection" button, status row

**Task 1.3 — Project collection binding**
- `.prismnext/settings.json`: `literature.zoteroCollectionId`
- `zotero-connect-dialog.tsx`: lists Zotero collections (via `listCollections`), pick one, save to project config
- Entry point: Literature toolbar → "Connect Zotero" → dialog
- Store: `boundCollectionId`, `setBoundCollection`

### Phase 2: Sync + cache

**Task 2.1 — Schema migration**
- `literature-service.ts` `initSchema`: add columns
  - `papers`: `zotero_key TEXT UNIQUE`, `source TEXT DEFAULT 'local'`, `zotero_version INTEGER`
  - `collections`: `zotero_key TEXT UNIQUE`, `zotero_parent TEXT`, `zotero_version INTEGER`
- Migration: existing rows get `source = 'local'`, `zotero_key = NULL`
- FTS rebuild unchanged

**Task 2.2 — `zotero-sync.ts`**
- `pullCollection(projectRoot, collectionKey)`: list items → upsert `papers` (by `zotero_key`), set `source = 'zotero'`, store `zotero_version`
- `pullCollections(projectRoot)`: list collections → upsert `collections` (by `zotero_key`)
- `pruneOrphans(projectRoot)`: remove cache rows whose `zotero_key` no longer in Zotero (with confirm)
- Tests: `tests/main/zotero-sync.test.ts`

**Task 2.3 — Store + IPC wiring**
- `literature-store`: `pullFromZotero(projectRoot)`, `syncCollectionsFromZotero(projectRoot)`, `zoteroStatus`, `lastSyncAt`
- IPC `zotero:pullCollection`, `zotero:pullCollections`
- Toolbar: Refresh button → `pullFromZotero`
- On project open (in `literature-content.tsx`): if `boundCollectionId` set, auto-pull

### Phase 3: PDF stream + cache

**Task 3.1 — PDF resolution in `literatureReadPdfBytes`**
- `literature-service.ts`: paper row carries `pdf_source` derived field:
  - `zotero` + `zotero_attach_key` → Zotero file
  - `local` + `pdf_path` → fs
- `literatureReadPdfBytes`:
  1. If cached at `.prismnext/library/pdf-cache/<zotero_key>.pdf` AND `zotero_version` matches cache manifest → return cached bytes
  2. Else fetch from Zotero `/items/{attachKey}/file`, write to cache, update manifest, return bytes
- Cache manifest: `.prismnext/library/pdf-cache/manifest.json` mapping `zotero_key → version`
- Fallback: standalone mode (no zotero_key) → existing `pdf_path` path

**Task 3.2 — Attachment key resolution**
- Zotero item may have child attachment items (the PDF). `zotero-client.getItemFile` must:
  - If item is a journal article → find child attachment of type `attachment` with `contentType: application/pdf`
  - Return that attachment's key for `/file` streaming
- Cache the `attach_key` on the paper row to avoid re-querying

### Phase 4: Collections CRUD write-back

**Task 4.1 — IPC + store actions**
- `zotero:createCollection` → client.createCollection → upsert cache
- `zotero:renameCollection` → client.patchCollection → update cache
- `zotero:deleteCollection` → client.deleteCollection → delete cache row
- `zotero:addToCollection` → client.addToCollection → update `collection_papers`
- `zotero:removeFromCollection` → client.removeFromCollection → update `collection_papers`
- Store actions wrap these; sidebar UI calls store actions (no direct IPC from UI)

**Task 4.2 — Sidebar UI**
- `literature-sidebar.tsx`: "New collection" → `createCollectionInZotero`
- Rename/delete confirm dialogs → call write-back actions
- Drag-to-collection (if present) or checkbox "add to collection" → `addToCollection`
- Show sync state per collection (last synced, pending writes)

### Phase 5: Citekeys + .bib

**Task 5.1 — Citekey resolver**
- `zotero-client.resolveCitekeys(itemKeys[])`:
  - If BBT detected: query BBT `/better-bibtex/json-rpc` `item.export` with `translator = Better BibTeX` → parse citekeys
  - Else: citekey = itemKey (uppercase)
- Cache citekey on `papers.citekey` column (re-resolve on refresh)
- `lib/literature/zotero-citekeys.ts`: renderer-side fetch + cache

**Task 5.2 — `.bib` generation**
- BBT present: prefer BBT auto-export (user-configured in Zotero) — Prism just reads the .bib path from project config; OR `zotero-client.exportBib(keys, 'better-bibtex')` for on-demand
- BBT absent: `zotero-client.exportBib(keys, 'bibtex')` (Zotero native, citekey = itemKey)
- IPC `zotero:exportBib` → returns .bib string → save to project `references.bib`
- Toolbar action: "Export .bib" → write to project

**Task 5.3 — Cite autocomplete + cite-check**
- `cite-autocomplete.ts`: source = `papers.citekey` (already cached)
- Cite-check tool: parse project `.tex` for `\cite{...}` → cross-reference `papers.citekey` in bound collection → report missing/mismatched
- ACP tool `literature-cite` updated to use cached citekeys

### Phase 6: UI polish + BBT banner

**Task 6.1 — BBT-absent banner**
- Toolbar: if `zoteroStatus === 'connected-no-bbt'` → non-blocking pill "Install Better BibTeX for readable citekeys" + link to https://retorque.re/zotero-better-bibtex/
- Dismissible per session

**Task 6.2 — Entry panel in Zotero mode**
- Metadata fields render read-only (Zotero badge "Source: Zotero")
- Hide Edit button in Zotero mode (show "Open in Zotero" instead — opens Zotero desktop to that item via `zotero://select/library/items/{itemKey}`)
- Annotations entry unchanged (Prism-owned)

**Task 6.3 — Refresh + sync states**
- Toolbar Refresh button with spinner during pull
- Per-item sync badge (stale if Zotero version > cached version)
- Last sync timestamp in sidebar footer

### Phase 7: AI features (v1)

**Task 7.1 — Summarize paper**
- Composer context insert: paper title + abstract + (optional) first-page text
- Already partially supported via existing `paper-snippet` context insert
- Add "Summarize" quick action in entry panel → opens composer with paper context + "Summarize this paper"

**Task 7.2 — Cite-check**
- New ACP tool or composer command: `/cite-check`
- Scans active .tex for `\cite{key}`, lists keys not in `papers.citekey` (bound collection)
- Reports in chat as a table

**Task 7.3 — Draft→citation suggestions**
- Composer action when selection in .tex editor: "Suggest citations for this paragraph"
- Sends selected text + list of papers in bound collection (title + abstract + citekey) to chat
- AI returns suggested citekeys with rationale

### Phase 8: Tests + docs

- `tests/main/zotero-client.test.ts`: mocked HTTP for all client methods
- `tests/main/zotero-sync.test.ts`: upsert + prune + version diff
- `tests/main/literature-pdf-cache.test.ts`: cache hit/miss/invalidation
- Update `CLAUDE.md` Literature Module section: Zotero integration
- Update `docs/superpowers/specs/2026-06-29-literature-reader-design.md` with Zotero mode

---

## Verification

```bash
cd prism-next
pnpm exec tsc --noEmit
pnpm test tests/main/zotero-client.test.ts
pnpm test tests/main/zotero-sync.test.ts
pnpm test tests/main/literature-pdf-cache.test.ts
pnpm test
```

Manual:
1. Open Prism with Zotero desktop running → Connect → see collections
2. Bind a collection → list mirrors in Prism
3. Click a paper → PDF streams + renders in reader
4. Highlight in reader → annotation persists across reopens
5. Create collection in Prism sidebar → appears in Zotero
6. `\cite{` in .tex editor → autocomplete shows BBT citekeys (or itemKey if no BBT)
7. Export .bib → writes to project `references.bib`
8. Close Zotero desktop → reopen Prism → cached PDFs still readable, list still visible, Refresh shows "Zotero offline"

---

## Out of Scope (v2+)

- Zotero websocket push (real-time sync)
- Annotation two-way sync with Zotero's own highlights
- Metadata write-back from Prism to Zotero (PATCH items)
- Tag support (Zotero tags ↔ Prism)
- Multiple Zotero accounts
- Standalone-mode revival UI (code stays, not surfaced)
- Related-papers / claim-search AI features
- Zotero web API PDF download (v1 PDF only via local API)
