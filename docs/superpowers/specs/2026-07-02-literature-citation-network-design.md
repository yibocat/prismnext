# Literature Citation Network — References & Cited-by Sidebar

> **Date:** 2026-07-02  
> **Status:** Approved / implementing  
> **Scope:** When reading a library paper, show **References** (outbound) and **Cited by Top-N** (inbound) in the reader sidebar. Data from OpenAlex; lazy-loaded with file cache.  
> **Out of scope (v1):** PDF bibliography parsing; citation graph visualization; Agent tool; Semantic Scholar fallback; bulk export.

## 1. Motivation

Researchers reading a paper often want to see what it cites and who cites it — without leaving Prism. Today the reader sidebar only has Notes and Marks. External catalogs already hold this graph; Prism has DOI/arXiv on most enriched entries.

## 2. Design principles

1. **Lazy, not automatic.** Fetch only when the user opens the **Citations** tab (or taps Refresh). Never prefetch on PDF open.
2. **OpenAlex first.** Free, already used for enrich; supports `referenced_works`, `cited_by_count`, and paginated `cites:` filter.
3. **Top-N + pagination for cited-by.** Show total count always; list defaults to top 25 by `cited_by_count:desc`; Load more up to a UI cap (500 rows).
4. **References paginated in bibliography order.** OpenAlex `referenced_works` order preserved; 25 per page.
5. **Identifier required.** No DOI and no arXiv → show empty state with explanation (no silent failure).
6. **Cache locally.** `.prismnext/library/cache/citations/{paperId}.json`, TTL 7 days; `refresh=true` bypasses.
7. **Library linkage.** Each row shows **In library** when DOI/arXiv matches a project entry; actions: Open / Add to library.

## 3. Data model

```ts
/** One row in References or Cited by lists */
interface PaperCitationEntry {
  openAlexId: string;       // e.g. W2741809807
  title: string;
  authors: string | null;   // display string
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  citedByCount: number | null;
}

interface PaperCitationSection {
  totalCount: number;
  items: PaperCitationEntry[];
  hasMore: boolean;
  /** References: numeric offset string; Cited by: OpenAlex cursor */
  nextCursor: string | null;
}

interface PaperCitationNetworkResult {
  ok: boolean;
  error?: string;
  openAlexWorkId?: string;
  references?: PaperCitationSection;
  citedBy?: PaperCitationSection;
  cachedAt?: number;
  source: "openalex";
}
```

## 4. API flow (OpenAlex)

```
Paper (doi | arxiv_id)
        │
        ▼
GET /works/{doi-or-arxiv-url}?select=id,referenced_works_count,referenced_works,cited_by_count
        │
        ├─ References: slice referenced_works[offset:offset+25]
        │              → batch GET /works?filter=openalex:W1|W2|… (preserve order)
        │
        └─ Cited by: GET /works?filter=cites:{workId}&sort=cited_by_count:desc&per-page=25&cursor=*
```

Rate limits: reuse catalog `User-Agent`; on 429/503 return partial error message; do not retry aggressively in v1.

## 5. IPC

| Channel | Args | Returns |
|---------|------|---------|
| `literature:getCitationNetwork` | `{ projectRoot, paperId, refresh? }` | First page of both sections + counts |
| `literature:getCitationNetworkPage` | `{ projectRoot, paperId, section: "references" \| "citedBy", cursor, refresh? }` | Next page for one section |

Main service: `src/main/services/literature-citation-network.ts`  
Shared types: `src/shared/paper-citation-network.ts`

## 6. UI (reader sidebar)

Extend `LiteraturePaperWorkspaceSidebar` tabs:

| Tab | Icon | Content |
|-----|------|---------|
| Notes | NotebookPen | (existing) |
| Marks | Highlighter | (existing) |
| **Citations** | Link2 | References + Cited by accordions |

**Citations tab layout:**

```
┌─ Citations ─────────────────────── [↻ Refresh] ─┐
│ References (42)                                  │
│   • Title — Author et al. · 2020 · Venue  [In lib]│
│   • …                                            │
│   [Load more]                                    │
│ ─────────────────────────────────────────────── │
│ Cited by (12,847)                                │
│   Top citations by impact                        │
│   • Title — … · 2023 · …                  [Add]  │
│   [Load more]                                    │
└──────────────────────────────────────────────────┘
```

States: loading skeleton, no-identifier empty, API error with retry, zero results.

Row actions:
- **In library** → `openPaperInMainLibrary(paperId)` or open reader if PDF exists
- **Not in library** → `literature:createFromIdentifier({ doi | arxivId })` then refresh library list

## 7. Constants

| Constant | Value |
|----------|-------|
| `PAPER_CITATION_PAGE_SIZE` | 25 |
| `PAPER_CITATION_UI_MAX_ROWS` | 500 per section |
| `PAPER_CITATION_CACHE_TTL_MS` | 7 days |

## 8. Tests

- `tests/main/literature-citation-network.test.ts`: mock `fetch` — resolve work, hydrate references order, cited-by cursor, cache read/write, missing identifier error.

## 9. Future (not v1)

- Agent `literature-citations` tool
- Semantic Scholar fallback when OpenAlex 404
- PDF References section parse for no-DOI papers
- Filter cited-by by year / open access
