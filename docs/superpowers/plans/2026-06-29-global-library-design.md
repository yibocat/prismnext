# Global Library + Project View — Architecture Design (C-tier)

**Date:** 2026-06-29
**Status:** Proposed — awaiting product decision before implementation
**Supersedes (partially):** `2026-06-29-literature-reader-design.md` "项目自包含" decision

## 背景

当前文献库是**项目级 SQLite**（`.prismnext/library/library.db`）。A/B 档修补已让它在「项目内阅读 + Zotero 单向 mirror」场景下稳且可演进，但留下一类**结构性**问题：

1. 同一 Zotero collection 被 N 个项目绑定 → N 份镜像副本 + N 份 PDF cache
2. annotations / reading list 永远项目内，换项目即丢
3. 跨项目复用只剩 `importFromProject`，且不保持 Zotero 身份的连续性
4. enrich 与 Zotero 在 A1 后能按 DOI 合并，但「同一篇论文的批注跨项目」仍无解

这些不是 bug，是**项目级模型承担了全局学术资产职责**的根因。

## 决策点（必须先选）

| 选项 | 取舍 |
|------|------|
| **保持项目级**（不做 C 档） | 文献库跟着 git 走、换机自包含；接受「跨项目批注不连续、PDF 重复、Zotero 镜像 N 份」 |
| **走全局 library**（C 档） | 文献跨项目复用、批注连续、PDF 全局去重、Zotero 镜像 1 份；失去项目级 git 可移植性，需数据迁移 |

**建议**：若 Prism 的核心用户是「一个 Zotero 库 + 多个写作项目」，C 档是对的；若核心是「每个写作项目完全独立、可打包归档」，保持项目级。

## 目标架构

```
全局 library（<userData>/prism-library/）
  ├─ library.db          # 唯一真理：papers、collections、annotations、pdf_blobs 引用
  ├─ pdf-blobs/          # 按 SHA-256 去重的 PDF 字节（Zotero PDF + 本地 import 共享）
  └─ zotero-cache/       # Zotero 镜像元数据缓存（按 zotero_key）

项目 view（.prismnext/library/）
  ├─ project_papers.db   # 引用全局 paperId + 项目级标记（reading list、cite 用记录）
  ├─ project_collections # 项目本地 collection（非 Zotero）
  └─ settings.json       # literature.zoteroCollectionId 绑定（不变）
```

### 全局 library.db schema（草案）

```sql
-- 唯一真理，按 identity 去重（A1 已实现 identity merge）
CREATE TABLE papers (
  id TEXT PRIMARY KEY,
  bibkey TEXT UNIQUE NOT NULL,
  title, authors, year, abstract, doi, arxiv_id, isbn, venue, type,
  source TEXT,                  -- 'zotero' | 'manual' | 'bibtex' | 'catalog'
  raw_bibtex TEXT,
  zotero_key TEXT UNIQUE,       -- 全局唯一 Zotero 镜像
  zotero_version INTEGER,
  zotero_attach_key TEXT,
  pdf_blob_sha TEXT,            -- 指向 pdf-blobs/{sha}（全局去重）
  created_at, updated_at
);

-- 批注全局化：换项目不丢
CREATE TABLE annotations (
  id TEXT PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  kind, page, rects, quoted_text, color, note,
  created_at, updated_at
);

-- 全局 collection（Zotero 镜像 + 用户全局 collection）
CREATE TABLE collections ( ... );
CREATE TABLE collection_papers ( ... );
```

### 项目 view schema

```sql
CREATE TABLE project_papers (
  paper_id TEXT PRIMARY KEY,    -- → 全局 papers.id
  project_root TEXT,
  added_at INTEGER,
  -- 项目级标记
  in_reading_list INTEGER DEFAULT 0,
  cite_count INTEGER DEFAULT 0, -- 本项目 .tex 引用次数
  PRIMARY KEY(paper_id, project_root)
);

CREATE TABLE project_collections (
  id TEXT PRIMARY KEY,          -- 项目本地 UUID
  project_root TEXT,
  name TEXT,
  parent_id TEXT,
  -- 不含 zotero_key（Zotero collection 在全局层）
);
```

### PDF 全局 blob store

- `pdf-blobs/{sha256}.pdf` — 内容寻址，同一 PDF 全局一份
- `papers.pdf_blob_sha` 指向它
- Zotero PDF 缓存也写入这里（A1 的 manifest sha 字段已为此铺路）
- 引用计数：blob 被多少 paper 引用；零引用时 GC

## 迁移路径

### 阶段 1：全局层落地（不动项目层）

1. 新增 `<userData>/prism-library/library.db` + schema
2. 新增 `GlobalLibraryService`：papers/annotations/collections CRUD（复用 A1 identity merge）
3. 新增 `PdfBlobStore`：`getBlob(sha)` / `putBlob(bytes) → sha` / `gc()`
4. Zotero sync 写全局层（替代当前写项目层）

### 阶段 2：双写过渡（项目层 + 全局层并存）

5. 项目 `openLibraryDb` 时，若全局层有同 identity paper，**优先全局**；项目层降级为引用
6. 新建 paper / import PDF → 写全局 + 项目引用
7. 读取 paper → 优先全局，fallback 项目层（兼容旧项目）

### 阶段 3：项目层瘦身

8. annotations 迁移到全局（按 paper_id）
9. 项目层 `papers` 表逐步清空，只留 `project_papers` 引用
10. PDF 从 `library/attachments/` 迁移到全局 `pdf-blobs/`（按 SHA）

### 阶段 4：清理

11. 项目层不再存 papers/annotations，只剩 `project_papers` + `project_collections`
12. 旧 `.prismnext/library/library.db` 迁移后归档为 `.bak`

## 代价与风险

| 项 | 说明 |
|----|------|
| **失去项目级 git 可移植性** | 文献库不再跟着项目走；打包项目给别人时不含文献（需 Zotero 或全局库导出） |
| **协作场景** | 全局库在 `<userData>`，多机不同步；需额外机制（Zotero 已是跨机源，可缓解） |
| **数据迁移** | 现有用户的 `.prismnext/library/library.db` 要迁到全局；迁移脚本 + 回滚 |
| **回退路径** | 若全局层出问题，项目层已瘦身则难回退；需保留双写期足够长 |
| **测试** | 全部 literature 测试要重写为全局层 + 项目 view 双层模型 |

## 何时该做

- 用户反馈「换项目批注丢了」「同一篇 PDF 下载 N 次」「Zotero 同步在 N 个项目重复」是高频痛点
- Prism 定位明确为「长期写作 + 跨项目学术资产」而非「单项目归档」
- 有专门的迁移测试窗口（不与功能开发挤同一周期）

## 何时不该做

- 用户主要场景是「一个项目 = 一篇论文 = 一次性归档」
- 项目级 git 可移植性是核心卖点
- 当前 A/B 档修补已足够（identity merge + detach 保留 annotations 已缓解最疼的问题）

## 建议落地顺序（若决定做）

1. `GlobalLibraryService` + `PdfBlobStore`（纯新增，不破坏项目层）
2. Zotero sync 双写（全局 + 项目）
3. 读取优先全局（fallback 项目）
4. annotations 迁移全局
5. 项目层瘦身 + 迁移脚本
6. 旧库归档

每步独立可验证、可回退。预计 3-4 个独立 PR。

---

## 与 A/B 档的关系

- **A1 identity merge** 是 C 档全局层的基石 —— 全局 papers 表正是按 identity 去重
- **A2 detach 保留 annotations** 让 annotations 在 C 档迁移时不会因 Zotero prune 丢失
- **B1 PDF manifest sha** 是 C 档全局 blob store 的寻址基础
- **B3 ZoteroWriter** 是 C 档「全局层写 Zotero」的统一入口

A/B 档做完后，C 档的迁移风险显著降低 —— identity 层、annotations 持久性、PDF sha、写抽象都已就位。
