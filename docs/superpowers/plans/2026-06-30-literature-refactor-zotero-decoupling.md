# 文献管理器重构：Zotero 从核心层剥离到插件层

**Date:** 2026-06-30
**Status:** In progress
**Goal:** 让文献管理器的核心层不知道 Zotero 存在。Zotero 变成独立的同步插件。

---

## 问题

现有代码以 Zotero 为中心设计，后改为"Zotero 可选"，在原结构上打补丁导致：

1. **PDF 存两处**：`pdf-cache/`（Zotero，用 zotero_key 命名）+ `attachments/`（本地，用 sha 命名）
2. **`papers.source` 混存**：既存条目来源（zotero/manual/bibtex）又存元数据源（crossref/dblp/…）
3. **Zotero 字段长在 papers 表**：每篇都有 zotero_key/version/attach_key，跟 Zotero 无关的也带着
4. **enrich 管线有 Zotero 短路**：literature-enrich.ts 里 findZoteroItemByIdentifier
5. **Collection 路由分散**：IPC 里按 isProjectZoteroWriteActive 分叉

## 目标架构

```
┌─────────────────────────────────────────────┐
│ 核心层（不知道 Zotero 存在）                  │
│                                              │
│  papers 表：                                 │
│    id, bibkey, title, authors, year,         │
│    abstract, doi, arxiv_id, venue, type,     │
│    pdf_path, pdf_sha, csl_json,              │
│    origin, metadata_source,                  │
│    created_at, updated_at                    │
│    （无任何 zotero_* 字段）                   │
│                                              │
│  PDF 存储：统一 attachments/<sha>.pdf        │
│  Collections：纯本地表                       │
│  Enrich：只走 source registry                │
└──────────────────┬──────────────────────────┘
                   │ 可选挂载
┌──────────────────▼──────────────────────────┐
│ Zotero 插件层                                │
│                                              │
│  zotero_mirror 表：                          │
│    paper_id → papers.id (FK)                 │
│    zotero_key (UNIQUE)                       │
│    zotero_version                            │
│    zotero_attach_key                         │
│                                              │
│  zotero-sync.ts：拉取 → 写 papers + mirror   │
│  zotero-writer.ts：collection 写回            │
│  zotero-client.ts：HTTP                      │
│  断开 = 删 zotero_mirror 行，papers 不动     │
└─────────────────────────────────────────────┘
```

## 改动清单

### Schema v3 → v4 迁移

1. 创建 `zotero_mirror` 表（paper_id FK, zotero_key UNIQUE, zotero_version, zotero_attach_key）
2. 从 papers 迁移 zotero_key/version/attach_key → zotero_mirror
3. papers 加 `origin TEXT` + `metadata_source TEXT` 列
4. 迁移 `source` 值：
   - `'zotero'` → origin='zotero', metadata_source=NULL
   - `'manual'` → origin='manual', metadata_source=NULL
   - `'bibtex'` → origin='bibtex', metadata_source=NULL
   - `'crossref'`/`'dblp'`/`'semantic-scholar'`/`'openalex'`/`'arxiv'`/`'datacite'`/`'openreview'` → origin='catalog', metadata_source=<原值>
5. papers 的 zotero_* 列保留但不再使用（SQLite 不方便 DROP COLUMN）

### PDF 存储统一

- 删 `literature-pdf-cache.ts` 的 `pdf-cache/` 目录概念
- Zotero 下载的 PDF 也写 `attachments/<sha>.pdf`，设 `papers.pdf_path`
- `literature-pdf-resolve.ts`：zotero_key 不再用于找缓存文件；检查 `paper.pdf_path`（统一路径）
- 迁移：现有 `pdf-cache/*.pdf` 文件移到 `attachments/`，更新 pdf_path

### Enrich 管线清理

- `literature-enrich.ts` 删 `findZoteroItemByIdentifier` / `createPaperFromCatalog` 短路
- enrich 只走 `resolveBibliographicMetadata`（source registry）
- Zotero 相关的 PDF 拉取只在 `zotero-sync.ts` 和 `literature-pdf-resolve.ts`（后者通过 zotero_mirror 表查 zotero_key）

### Collection 路由

- collection CRUD 默认走本地（literature-service.ts）
- 只有在 `zotero_mirror` 有对应 collection 时，额外触发 Zotero 写回
- 路由逻辑集中到 `zotero-sync.ts` 一个函数

### 代码文件影响

| 文件 | 改动 |
|------|------|
| `literature-service.ts` | schema v4、origin/metadata_source、zotero_mirror 表、detach 改为删 mirror 行 |
| `literature-pdf-cache.ts` | 简化或合并到 attachments 逻辑 |
| `literature-pdf-resolve.ts` | 走 zotero_mirror 查 key，PDF 统一 attachments |
| `literature-enrich.ts` | 删 Zotero 短路 |
| `zotero-sync.ts` | sync 写 papers + zotero_mirror；detach 删 mirror 行 |
| `zotero-client.ts` | 不变 |
| IPC / store / UI | source 字段 → origin 显示 |

### 断开 Zotero（重构后）

```
detachAllZoteroMirrors:
  1. DELETE FROM zotero_mirror  ← 一条 SQL，papers 完全不动
  2. UPDATE collections SET zotero_key=NULL（如果有镜像 collection）
  3. PDF 已在 attachments/，不需要迁移
```

比现在干净得多：papers 表一行都不改，只删 zotero_mirror 的关联行。

## 实施顺序

1. Schema v4 迁移 + zotero_mirror 表 + origin/metadata_source
2. PDF 存储统一到 attachments/
3. enrich 清理 Zotero 短路
4. detach 改为删 mirror 行
5. 测试更新
