# Next: Agent PDF Reading + Literature ↔ TeX Workspace

> **Status:** Backlog (not started)  
> **Date noted:** 2026-07-01  
> **Context:** After v0.5.0 release (Literature library, Zotero, session citation staging)

## 1. Let AI Agent read paper PDF content

**Problem today**

- `literature-read` returns metadata, abstract, highlights, and **PDF path only** (`pdf_content_included: false`).
- `@paper` / `buildPaperAgentContextBlock` explicitly excludes PDF full text.
- Session citations (`literature-stage`) are catalog metadata only — no PDF.
- Generic file `read` on `.pdf` is not useful (binary).

**Goal**

Agent can answer questions about **specific sections/pages** of a paper the user cares about (library entry or staged citation with attached PDF).

**Design directions to decide**

| Approach | Pros | Cons |
|----------|------|------|
| **Page/range tool** (`literature-read-pdf`?) — extract text for pages N–M via pdfjs/main | Precise, on-demand, fits long papers | Needs pagination UX in prompts; repeated calls for wide questions |
| **Chunk + search** — index extracted text per paper in library | Good for “find where they define X” | Storage, re-index on PDF replace, scope creep |
| **User-driven snippet** (extend `paper-snippet` / Send to AI from reader) | Already partially built | Not automatic; user must select |

**Likely minimum viable (v0.5.x)**

1. Main-process PDF text extraction (reuse pdf identifier / enrich paths; avoid duplicating pdfjs in main if possible).
2. New bridge action + OpenCode tool: read by `bibkey` + optional `pages` or `query` (FTS over extracted cache).
3. Prompt rules: prefer staged/library bibkey; cite page numbers in replies.
4. Optional: on `literature-read`, include first-page abstract block if not in metadata.

**Non-goals (for first slice)**

- Full-document auto-ingest into every chat turn.
- Replacing Zotero or external RAG stack.

**Related files**

- `src/main/services/literature-bridge.ts` (`handleRead`)
- `src/main/tools/literature-read.ts`
- `src/renderer/lib/literature/paper-agent-context.ts`
- `docs/superpowers/plans/2026-06-30-literature-integration-plan.md` (Phase 2/3 gaps)

---

## 2. Connect Literature and TeX Workspace

**Problem today**

- Literature (`library.db`) and TeX (`references.bib`, `\cite{}`) are parallel paths.
- Integration plan Phase 3 (TeX cite autocomplete, `literature-cite` → `.bib`) not fully wired in UI/workflow.

**Goal**

Seamless **read → cite → compile**: pick papers from library or session citations and insert correct `\cite{bibkey}` / sync `.bib` without manual copy.

**Likely work items**

1. **TeX editor `\cite{}` autocomplete** from `library.db` (existing plan: cite-autocomplete home).
2. **`literature-cite` tool + UI** — append/update project `.bib` from library entry.
3. **Session citations → TeX** — “Insert citekey into editor” / “Add to library then cite” from staged panel.
4. **Cross-mode navigation** — from TeX preview/source, jump to Literature paper; from Literature, “Open in TeX workspace” for notes/manuscript.
5. **Compile awareness** — ensure `\cite` keys in `.tex` resolve against exported/synced `.bib` (compile problems hint when key missing).

**Related files**

- `src/main/tools/literature-cite.ts`
- `src/renderer/modes/texworkspace-mode/`
- `docs/superpowers/plans/2026-06-30-literature-integration-plan.md` § Phase 3

---

## Suggested order

1. **PDF read (tool + extraction)** — unblocks “what does section 3 say?” in chat.
2. **TeX `\cite` autocomplete + literature-cite UX** — unblocks writing loop.

---

## Acceptance (draft)

- [ ] Agent tool returns readable text for a library PDF (by bibkey, page range or search).
- [ ] Prompt/docs tell agent when to use PDF read vs metadata-only read.
- [ ] From TeX workspace, `\cite{` suggests library bibkeys; inserting citekey works.
- [ ] From Literature / Session citations, user can add to `.bib` and/or insert `\cite{}` in active `.tex`.
