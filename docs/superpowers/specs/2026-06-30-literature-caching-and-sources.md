# Literature Caching & Source Architecture

## Caching: what is stored where

| Data | Where | Always local? |
|------|-------|---------------|
| **Paper metadata** (title, authors, year, abstract, DOI, arXiv, venue, type, bibkey, raw_bibtex, csl_json) | `library.db` (SQLite, project-level) | ✅ Yes — in the DB the moment the entry is created |
| **Annotations / highlights** | `library.db` `annotations` table | ✅ Yes |
| **Collections** (name, hierarchy, paper links) | `library.db` `collections` + `collection_papers` | ✅ Yes |
| **Reading list** (cited-in-project tracking) | `library.db` `reading_list` | ✅ Yes |
| **PDF file bytes** — locally imported | `.prismnext/library/attachments/<sha>.pdf` | ✅ Yes (copied on import) |
| **PDF file bytes** — Zotero-sourced | `.prismnext/library/pdf-cache/<zotero_key>.pdf` | ⚠️ Cached on first open; **not** cached until you open the paper once |

**Key point:** All bibliographic metadata is always local in SQLite. The only thing that might need a network round-trip is the **PDF file** for Zotero-sourced entries you haven't opened yet. Once you open it, the PDF is cached locally and never re-downloaded (unless the Zotero version changes).

## Source architecture (unified layer)

```
                    ┌─────────────────────────────────────┐
                    │  literature-enrich.ts               │
                    │  (ingest PDF, addByDoi, addByArxiv, │
                    │   enrichPaperFromCatalog)           │
                    └──────────────┬──────────────────────┘
                                   │ calls
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  shared/bibliographic-metadata/      │
                    │  resolver.ts                        │
                    │  resolveBibliographicMetadata()      │
                    └──────────────┬──────────────────────┘
                                   │ delegates to
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  sources/index.ts                   │
                    │  SOURCE_REGISTRY (ordered by        │
                    │  priority) → runChain → merge       │
                    └──────────────┬──────────────────────┘
                                   │ iterates
              ┌────────┬───────────┼───────────┬─────────┐
              ▼        ▼           ▼           ▼         ▼
         crossref   dblp       arxiv     s2     openalex   openreview   datacite
         (10)      (12)       (15)      (20)    (25)       (30)        (50)
```

**To add a source:**
1. Create `sources/<name>.ts` exporting a `BibliographicSource`
2. Import + add to `SOURCE_REGISTRY` in `sources/index.ts`
3. Add its id to `BibliographicSource` type in `types.ts`

The source implements `resolveByDoi` / `resolveByArxiv` / `resolveByTitle` (whichever it supports). The registry runs them in priority order, merges results (longer title/abstract wins, gaps filled from later sources), and returns one `BibliographicMetadata`.

## Current sources

| Source | Priority | Supports | Coverage |
|--------|----------|----------|---------- |
| Crossref | 10 | DOI | General scholarly, journals, books |
| **DBLP** | 12 | DOI, title | **CS/AI top conferences** (NeurIPS, ICML, ICLR, CVPR, ACL, AAAI…) |
| arXiv | 15 | arXiv | Preprints |
| Semantic Scholar | 20 | DOI | CS + general, citation data |
| **OpenReview** | 25 | title | **ICLR, NeurIPS workshops, CoRL** |
| OpenAlex | 30 | DOI, arXiv | General, open access PDF URLs |
| DataCite | 50 | DOI | Datasets, software, DOI registrations |

## Zotero's role (optional enhancement, not core)

- **Sync source**: pull a Zotero collection into the local library
- **PDF source**: fetch PDFs from Zotero storage/linked files
- **Future**: push local entries to Zotero, Word integration, browser connector

**Disconnecting** (`setBoundCollection(null)`) calls `detachAllZoteroMirrors`:
- All `source='zotero'` papers → `source='manual'`, `zotero_key=NULL`
- All Zotero-mirrored collections → local collections, `zotero_key=NULL`
- Metadata, annotations, cached PDFs, collection structure all survive
- Re-connecting + syncing re-attaches via DOI/arXiv identity merge
