# 原生文献管理器独立化 + 多源模块化 + Citation.js 引入

**Date:** 2026-06-30
**Status:** Approved, in progress
**Motivation:** Zotero 从"核心"降级为"可选增强"；原生文献管理器必须能独立站着。元数据抓取要模块化、多源、覆盖 AI 顶会。

---

## 背景

文献模块最初设计为"Zotero 单向镜像 + 本地 CRUD"。问题：

1. **重度依赖 Zotero**：没装 Zotero 的用户进文献模式看到的全是 Zotero 引导，体验上像"必须装"
2. **多源写死**：Crossref / S2 / OpenAlex / arXiv / DataCite 散在 `providers.ts`，`resolver.ts` 的 `DOI_CHAIN` 硬编码，加源要改三处
3. **缺 DBLP**：CS/AI 顶会论文（NeurIPS、ICML、ICLR、CVPR、ACL…）用 DBLP 找最准，我们没接
4. **自写 bibtex-parse**：正则解析，处理不了 `@string` 宏、`crossref`、复杂嵌套；Citation.js 更稳
5. **无 CSL 排版**：想要 APA/IEEE/Chicago 引用格式得自己造轮子

## 目标

- 原生文献管理器**独立可用**：不连 Zotero 也能完成 CRUD / PDF / 高亮 / 导入导出 / DOI 拉元数据
- Zotero 退到"可选增强"位（同步源 + PDF 来源 + 未来 Word/connector 互操作）
- 元数据源**注册表化**：加源只写一个文件 + 一行注册
- 覆盖 AI 顶会：加 **DBLP** + **OpenReview**
- BibTeX 解析换 **Citation.js**
- 引用排版用 **citeproc-js**（经 Citation.js `plugin-csl`）

## 非目标

- 不做标签 / 智能集合 / 笔记侧栏（Prism 其它模块已有）
- 不做向量检索 / 语义搜索（未来里程碑）
- 不做 Push to Zotero（未来里程碑，CSL-JSON 列先铺好）
- 不复现 Zotero 全部功能

---

## 架构

### 源注册表（`src/shared/bibliographic-metadata/sources/`）

```
sources/
  index.ts          — registry + resolveByDoi / resolveByArxiv / resolveByTitle
  types.ts          — BibliographicSource 接口
  crossref.ts       — 现有，迁入
  semantic-scholar.ts
  openalex.ts
  datacite.ts
  arxiv.ts
  dblp.ts           — 新增
  openreview.ts     — 新增
```

**接口：**

```ts
export interface BibliographicSource {
  id: string;                              // "crossref" | "dblp" | ...
  label: string;                           // UI 显示名
  supports: { doi?: boolean; arxiv?: boolean; title?: boolean };
  resolveByDoi?(doi: string): Promise<BibliographicMetadata | null>;
  resolveByArxiv?(arxivId: string): Promise<BibliographicMetadata | null>;
  resolveByTitle?(title: string): Promise<BibliographicMetadata | null>;
  priority: number;                        // 链式顺序
  enabled: boolean;                        // 可关
}
```

**注册：**

```ts
// sources/index.ts
export const SOURCE_REGISTRY: BibliographicSource[] = [
  crossrefSource,
  dblpSource,           // CS 优先，会议论文准
  semanticScholarSource,
  openalexSource,
  arxivSource,
  dataciteSource,
  openreviewSource,
];

export async function resolveByDoi(doi: string): Promise<BibliographicResolveResult> {
  // 按 priority 顺序跑，merge 结果，记录 attempted
}
```

加源 = 写一个文件 + 在 `index.ts` 数组加一行。

### DBLP 源

- API: `https://dblp.org/search/publ/api?q=<query>&format=json`
- 按 DOI 查：`https://dblp.org/search/publ/api?q=doi:10.1145/346...&format=json`
- 按标题查：模糊匹配，返回候选列表
- 字段：title / authors / year / venue / type / doi
- **价值**：NeurIPS / ICML / ICLR / CVPR / ACL / EMNLP / AAAI / IJCAI 等顶会覆盖最全

### OpenReview 源

- API: `https://api2.openreview.net/notes?content.title=<title>`
- 价值：ICLR、NeurIPS workshops、CoRL 等 OpenReview 托管的会议
- 字段：title / authors / abstract / venue / pdfUrl

### Citation.js 引入

- `@citation-js/core` + `plugin-bibtex` + `plugin-csl` + `plugin-doi` + `plugin-ris`
- **替换** `src/main/lib/bibtex-parse.ts`
- BibTeX 导入：`Cite.parse(bib)` → CSL-JSON → 写库
- BibTeX 导出：库行 → CSL-JSON → `Cite.format('bibtex')`
- CSL 引用：`Cite.format('bibliography', { template: 'ieee' })`

### CSL-JSON 列（schema v3）

- `papers` 表加 `csl_json TEXT`
- 导入路径（DOI / arXiv / BibTeX / PDF）写 CSL-JSON
- Zotero 条目也存 CSL-JSON（Zotero 能导出）
- 未来 Push to Zotero / Word 集成直接用这列

### UX 重心

| 位置 | 改前 | 改后 |
|------|------|------|
| 空库首屏 | "连接 Zotero" 引导 | "拖入 PDF 或按 DOI 添加" |
| BBT 横幅 | 默认显示 | 折进"增强"菜单 |
| 工具栏 Connect Zotero | 一级按钮 | 进"同步"二级菜单 |
| Add 菜单 | PDF/DOI/arXiv/BibTeX 已有 | 不变（这是原生路径） |
| Zotero Collections 侧栏 | 顶部 | 折叠区"Zotero（可选）" |

---

## 实施顺序

| 优先级 | 任务 | 文件 |
|--------|------|------|
| P0 | 源注册表模块 | `src/shared/bibliographic-metadata/sources/` |
| P0 | DBLP 源 | `sources/dblp.ts` |
| P0 | 现有 5 源迁入注册表 | `sources/{crossref,semantic-scholar,openalex,datacite,arxiv}.ts` |
| P0 | `resolver.ts` 改走注册表 | `bibliographic-metadata/resolver.ts` |
| P1 | 装 Citation.js，替换 bibtex-parse | `src/main/lib/bibtex-parse.ts` → 删 |
| P1 | CSL 引用输出 | `literature-service.ts` export + IPC |
| P1 | UX 降级 Zotero | `literature-content.tsx` / `literature-toolbar.tsx` / sidebar |
| P2 | OpenReview 源 | `sources/openreview.ts` |
| P2 | CSL-JSON 列 + 迁移 | `literature-service.ts` schema v3 |
| P2 | 源注册表测试 + DBLP 测试 | `tests/main/` |

## 风险

- Citation.js 体积（~500KB min），main 进程加载可接受
- DBLP API 无 key，限速宽松但高频要 cache
- OpenReview API v2 不稳，必要时降级为按 title 模糊匹配
- CSL-JSON 列加完不影响现有查询（JSON blob），但 citeproc 渲染要解析

## 未来（不在本轮）

- Push to Zotero（用 CSL-JSON 构造 item）
- 全局库（跨项目 library.db）
- 向量检索 / 语义搜索
- Zotero 浏览器 connector 接收端
- Word 引用插件
