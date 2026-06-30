# Literature Reader Mode — Design Spec

**Date:** 2026-06-29  
**Status:** Approved / Implemented (M0–M3)

## 定位

不做另一个 Zotero。做一个**项目自包含、AI 原生**的文献阅读器：文献和写作在同一个工作流里，Agent 能直接检索库并正确引用。

## 已锁定决策

| 决策 | 选择 |
|---|---|
| 主线 | 读到写 / 建库 / AI 综述 三条并重 |
| 推进方式 | 分阶段，共享地优先 |
| 存储后端 | better-sqlite3（`.prismnext/library/library.db`，WAL） |
| 库归属 | 项目级；跨项目复用靠「从其他项目导入」 |
| 高亮持久化 | 只存 DB（JSON rects），PDF 不动 |
| Zotero | Better BibTeX 导出文件导入 |
| Agent 访问库 | OpenCode 工具用 `bun:sqlite` 直读 + `fs` 写 `.bib` |
| PDF 渲染 | 复用 `@anaralabs/lector` + `pdfjs-dist`（非 MuPDF） |

## 用户视角（按里程碑）

### M0 — 共享地基
- 拖 PDF / 导入 BibTeX → 元数据进库
- Lector 阅读器（zoom/暗色/侧栏）
- 高亮落 DB；选中 → Send to AI（`paper-snippet`）
- Sidebar FTS 检索

### M1 — 读到写闭环
- Agent 工具：`literature-search` / `literature-read` / `literature-cite`
- `\cite{}` 补全 + 自动写 `.bib`
- 阅读器 Summarize / Send to AI

### M2 — AI 综述
- `@paper` mention
- Generate Review（多篇 → chat 上下文）
- Reading-list「Cited in this project」视图

### M3 — Collection polish
- Zotero Better BibTeX（.bib + .json 附件路径）
- 跨项目导入
- 批注侧栏（Notes 视图 + annotations 列表）

## 架构

```
.prismnext/library/
  library.db          # SQLite + WAL + FTS5
  attachments/      # PDF by content hash

Main: literature-service.ts + ipc/literature.ts
Renderer: modes/literature-mode/ + literature-store.ts
OpenCode: tools/literature-{search,read,cite}.ts (bun:sqlite)
```

## 数据模型

- `papers` — 元数据 + `raw_bibtex` + `pdf_path`/`pdf_sha`
- `papers_fts` — FTS5 全文检索
- `annotations` — 高亮/批注（rects JSON）
- `reading_list` — 项目引用集合

## 文件清单

见 implementation plan `docs/superpowers/plans/2026-06-29-literature-reader-m0.md`。

## 风险与验证

1. **Lector 高亮**：使用 `ColoredHighlightLayer` + `AnnotationsStoreProvider` + DB 同步
2. **better-sqlite3 ABI**：`postinstall` electron-rebuild；`asarUnpack` 已配置
3. **WAL 并发**：主进程写 + Bun 工具只读
4. **Vitest**：DB 集成测试受 Node/Electron ABI 影响；单元测试覆盖 bibtex-parse
