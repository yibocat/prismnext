# Agent PDF Reading — Per-Paper Extraction & Multi-Source Access

> **Date:** 2026-07-01
> **Status:** Approved / implementing (v0.5.1)
> **Scope:** Let the AI agent read content of papers in the project literature library, via on-demand background extraction (MinerU cloud API) with a pdfjs baseline.
> **Out of scope:** User-compiled PDFs (those have TeX source); full-text RAG indexing; chat composer source-picker UI.

## 1. Motivation

Today the agent can only see paper **metadata + abstract + saved highlights + PDF path** — not the body. For questions like "what does Section 3 propose?" or "show me the loss function", the agent has nothing to read. Direct PDF upload to the LLM is expensive, slow, and imprecise (formulas/tables get mangled). We need structured text the agent can quote with page numbers.

## 2. Design principles

1. **Selective, not bulk.** Each paper is extracted only when the user (or agent) asks. No "extract all library" sweep.
2. **Background async.** MinerU cloud itself queues; Prism mirrors that with a local queue + worker. UI never blocks.
3. **Multi-source, per-paper.** A paper may have several extract sources available; agent picks the best one that's ready.
4. **Local-first baseline.** `pdfjs` text extraction (already integrated) works offline, zero config. MinerU is the optional quality path.
5. **Cached.** Extracted `.md` lives under `.prismnext/library/extract/`; second read is instant.
6. **User-driven enqueue.** Entry panel has an **Extract MD** button. Badge on library row shows status. Agent can also request extraction through its tool.

## 3. Extraction sources (per paper)

Borrowing the `llm-for-zotero` mental model:

| Source | Tag | How | Quality | When ready |
|--------|-----|-----|---------|------------|
| **MD (MinerU)** | `MD` green | MinerU cloud API (precision extract) | High — formulas → LaTeX, tables → HTML, OCR | After background queue completes |
| **PDF (built-in)** | `PDF` purple | pdfjs text extraction in main process | Baseline — text only, formulas/tables degrade | Instant (on first read) |
| **HTML snapshot** | `HTML` orange | Publisher page fetch (DOI / arXiv landing) | Medium — abstract + page text | On demand |
| **TeX source** | `TEX` blue | If paper has linked TeX (rare in library) | Best | Always |

v0.5.1 ships **MD (MinerU)** + **PDF (pdfjs)** + **HTML snapshot**. TeX remains a placeholder.

## 4. Per-paper state machine

```
            ┌──────────┐  click Extract / agent request
            │  idle    │ ─────────────────────┐
            └──────────┘                       ▼
         ▲            ┌──────────┐  worker picks up   ┌─────────────┐
         │  cancel    │ queued   │ ─────────────────► │ extracting  │
         │            └──────────┘                    └─────────────┘
         │                                                  │
         │                                                  │ MinerU done
         │                                                  ▼
         │            ┌──────────┐  re-extract / PDF    ┌─────────────┐
         └─────────── │ failed   │ ◄─────────────────── │ ready       │
                      └──────────┘   transient error    └─────────────┘
                          ▲                                 │
                          │                                 │ source upgraded
                          └─────────────────────────────────┘
```

States stored per `(paperId, source)`:

```ts
interface PaperExtractState {
  paperId: string;
  source: "mineru" | "pdfjs";
  status: "idle" | "queued" | "extracting" | "ready" | "failed";
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** Path under .prismnext/library/extract/ */
  mdPath?: string;
  /** Page count actually extracted */
  pages?: number;
  /** MinerU job id (for status polling) */
  remoteJobId?: string;
}
```

Stored in `library.db` (new table `paper_extracts`) so state survives restart.

## 5. Library schema additions

```sql
CREATE TABLE IF NOT EXISTS paper_extracts (
  paper_id   TEXT NOT NULL,
  source     TEXT NOT NULL,          -- 'mineru' | 'pdfjs'
  status     TEXT NOT NULL,          -- 'idle'|'queued'|'extracting'|'ready'|'failed'
  md_path    TEXT,                   -- relative to .prismnext/library/extract/
  pages      INTEGER,
  remote_job_id TEXT,
  error      TEXT,
  queued_at  INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  PRIMARY KEY (paper_id, source)
);
```

Files:

```
.prismnext/library/extract/
  {paperId}/
    mineru.md         # MinerU output (formulas as LaTeX, tables as HTML)
    mineru.meta.json  # { pages, finishedAt, model, version }
    pdfjs.md          # pdfjs baseline (text only)
    pdfjs.meta.json
```

## 6. UI

### 6.1 Library row badge

Each literature row shows a small status chip **on the left**, **only on hover or when the row is selected/expanded** (idle rows stay clean):

| State | Chip |
|-------|------|
| `ready` (MD) | `MD` green |
| `ready` (pdfjs only) | `PDF` purple (faded) |
| `queued` | `…` muted |
| `extracting` | spinner muted |
| `failed` | `!` red (hover → error) |
| `idle` | (nothing — clean) |

Default: nothing shown for `idle`, to keep the list uncluttered.

### 6.2 Entry panel — Extract block

Inside `LiteratureEntryPanel` (or `StagedCitationEntryPanel`), a dedicated section:

```
┌─ PDF content ────────────────────────────┐
│ Status: Not extracted                    │
│                                          │
│ [ Extract MD (MinerU)  ▾ ]               │
│   ├─ Extract MD (MinerU)  ← recommended  │
│   ├─ Extract text (built-in, fast)       │
│   └─ Re-extract                          │
│                                          │
│ [ Open extracted .md ]   (when ready)    │
└──────────────────────────────────────────┘
```

- Click **Extract MD** → enqueue, chip flips to `…`
- Click **Extract text (built-in)** → pdfjs, usually instant
- When ready: **Open .md** opens in Files mode (read-only-ish note)
- Failure: red banner with retry

### 6.3 Settings → Literature

```
PDF extraction
  Engine default: [ Built-in (pdfjs) ▾ ]
                  [ MinerU (cloud, precision) ]

  MinerU API token: [____________]  (leave empty to use free flash-extract; 10MB / 20 pages limit)
  [ Test connection ]

  Auto-extract on import:  ☐  (off by default — explicit user action; validate before enabling)
```

## 7. Background extraction queue

Main-process service `literature-extract-queue.ts`:

- Single worker, sequential (MinerU rate-limits anyway)
- Persists in DB so queue survives restart
- On app start: resume `queued` / `extracting` items → re-poll MinerU job status
- Emits IPC events to renderer: `extract:statusChanged`, `extract:progress`, `extract:done`, `extract:failed`

Flow:

```
enqueue(paperId, source)
  → DB: status = queued, queued_at = now
  → emit extract:statusChanged
  → worker picks next queued item
  → DB: status = extracting, started_at = now
  → if source = mineru:
      call MinerU API (submit → poll → download)
  → if source = pdfjs:
      run pdfjs in main (pdfjs-dist works in Node) → text → md
  → write .md + .meta.json
  → DB: status = ready, md_path, finished_at
  → emit extract:done
  → on error: status = failed, error, emit extract:failed
```

## 8. MinerU API integration

Use `mineru-open-sdk` (Python) → no, we're Node. Use their REST API directly.

Two modes:

- **Flash Extract** (no token): `POST` to MinerU endpoint, 10MB / 20 pages limit. Good for short papers / abstracts.
- **Precision Extract** (token required): submit + poll async job. Up to 600 pages, 200MB. VLM layout, formula → LaTeX, table → HTML, OCR.

Prism wraps both; picks precision when token present, flash otherwise. On failure (429 / 5xx / timeout), falls back to pdfjs baseline and emits a warning.

**Privacy note**: PDF is uploaded to MinerU servers. Settings panel must disclose this clearly. Local-only users keep the built-in engine.

## 9. Agent tool: `literature-read-pdf`

New OpenCode tool, alongside `literature-read`:

```ts
args: {
  bibkey: string;        // library cite key
  pages?: string;        // "1-5" / "3,7,9" / omit = whole paper
  query?: string;        // return only matching paragraphs (with page refs)
  source?: "auto" | "mineru" | "pdfjs";  // default: auto = best available
  force?: boolean;       // ignore cache, re-extract
}
```

Returns:

```json
{
  "bibkey": "vaswani2017attention",
  "source": "mineru",
  "cached": true,
  "pages": "1-5",
  "markdown": "...",         // possibly truncated to a token budget
  "truncated": false,
  "hint": "Cite as p.X when quoting. Use pages= for narrower ranges."
}
```

Behaviour:

1. Look up paper by bibkey in `library.db`.
2. Check `paper_extracts` for a `ready` entry:
   - `source=auto`: prefer `mineru` if ready, else `html`, else `pdfjs`
   - If none ready **and** `force` is false: return `not_extracted` + hint.
3. If `force=true`: enqueue (user-visible toast via `extract:agentRequested`), wait with timeout, then return.
4. Read `.md`, slice to `pages` / filter to `query`, truncate to ~6k tokens, return.

Prompt rule additions (`citations.ts`):

- For "what does the paper say about X" / "show me the equation for Y" → `literature-read-pdf` with `pages` or `query`.
- Always cite page numbers as `p.X` when quoting.
- If not extracted, call with `force=true` (user gets a notice) or ask them to Extract in Literature.

## 10. Renderer store

New `useLiteratureExtractStore` (Zustand, not persisted — state comes from DB via IPC):

```ts
{
  statesByPaper: Record<string, { mineru?: PaperExtractState; pdfjs?: PaperExtractState }>;
  loadStatesForPapers(paperIds: string[]): Promise<void>;
  enqueue(paperId: string, source: "mineru" | "pdfjs"): Promise<void>;
  cancel(paperId: string, source: "mineru" | "pdfjs"): Promise<void>;
  // subscribes to IPC extract:* events
}
```

Library list and entry panel read from this store for badges / buttons.

## 11. IPC

| Channel | Purpose |
|---------|---------|
| `extract:enqueue` | `(projectRoot, paperId, source)` → returns ok |
| `extract:cancel` | `(projectRoot, paperId, source)` |
| `extract:list` | `(projectRoot, paperIds[])` → states |
| `extract:get` | `(projectRoot, paperId, source)` → md content + meta |
| `extract:openMd` | open the cached `.md` in Files mode |
| `extract:testMineru` | probe token validity |
| `extract:statusChanged` (event) | push state updates |
| `extract:done` / `extract:failed` (events) | push final state |

## 12. Phasing

### v0.5.1 — Minimum viable

- DB schema + migration for `paper_extracts`
- `literature-extract-queue.ts` main-process worker
- pdfjs baseline extraction in main process
- MinerU API client (precision + flash) with token from settings
- IPC + renderer store
- Entry panel Extract block (MD + built-in buttons, status, open .md)
- Library row badge
- Agent tool `literature-read-pdf`
- Prompt rules
- Tests: queue state machine, MinerU client mock, tool contract, DB migration

### v0.5.2 — Polish

- Auto-extract on import (opt-in setting)
- Re-extract when PDF replaced
- "Extract all in collection" batch action with concurrency cap
- Failure retry / backoff UI
- HTML snapshot source (browser capture)

### Later

- Vector index over extracted md for `query=` semantic search
- Figure/table extraction as separate assets the agent can reference
- Per-section chunking for RAG

## 14. Block-aligned PDF reading (MinerU Block Pick)

When a paper has **MinerU precision** extract with `content_list.json`, Prism persists layout blocks under `.prismnext/library/extract/{paperId}/mineru.blocks.json`. Each block carries:

- `pageIdx` (0-based), normalized `bbox` (0–1), `type` (text / equation / table / …), and a pre-built `markdown` snippet.

### UI (Literature PDF reader)

- **Hover**: block outline follows cursor (does not block text selection).
- **Shift+Click** or **Blocks** toolbar toggle: pick a block → floating toolbar → **Send to Chat** / **Insert note**.
- **Structured excerpt**: after drag-select, map selection to overlapping MinerU blocks and send Markdown (not raw PDF text).

### Chat payload

Paper snippets include structured Markdown in `quotedText`; composer serializes as:

```paper {bibkey}
# Title (p.N, block: equation)
{markdown snippet}
```

Requires re-extract (force) for papers extracted before this feature to populate `mineru.blocks.json`.

## 13. Acceptance

- [ ] Library entry panel has Extract MD button; clicking enqueues and shows status
- [ ] Row badge reflects state (queued / extracting / ready / failed)
- [ ] Extracted `.md` opens in Files mode
- [ ] Agent tool `literature-read-pdf` returns body text for a ready paper
- [ ] Agent tool returns a clear "not extracted" hint when none ready
- [ ] Settings → Literature exposes engine default + MinerU token + test
- [ ] No token → built-in pdfjs works; MinerU unavailable gracefully
- [ ] Queue survives app restart (DB-persisted)
- [ ] Prompt rules tell agent when to use which read tool
