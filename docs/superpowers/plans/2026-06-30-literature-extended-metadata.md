# Literature 扩展元数据（卷 / 期 / 页码 / 出版社 / URL …）

> 日期：2026-06-30
> 范围：Literature 模块的元数据完整性——从 catalog 源、Zotero、BibTeX 一路到 UI 与 Agent 工具。
> 状态：Phase 1–4 已完成（2026-06-30）；Phase 5 可选待执行

## 1. 现状

### 1.1 UI 展示的字段（展开面板）

`literature-entry-panel.tsx` 当前只渲染：

`Title · Type · Provenance · Year · Publication(venue) · Authors · Cite key · DOI · arXiv · ISBN · Abstract · Notes`

**缺失**：volume / issue / pages / publisher / url / language / container-title-short / event / editors / note 等学术条目常见字段。

### 1.2 数据库 schema（`papers` 表，`literature-service.ts`）

flat 列：

```
id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn,
venue, type, pdf_path, pdf_sha, origin, metadata_source, raw_bibtex, csl_json,
created_at, updated_at
```

- **没有** volume / issue / pages / publisher / url 等独立列。
- **有** `csl_json TEXT`，但目前只被 enrich 写入，且 `bibliographicToCslJson()` 只映射 title/author/year/doi/venue/abstract —— 大量字段在源解析阶段就被丢弃。

### 1.3 Catalog 源（`shared/bibliographic-metadata/`）

`BibliographicMetadata` 接口只有：title / authors / year / abstract / doi / arxiv_id / venue / type / source / pdfUrl。

各源**API 实际返回但被丢弃**的字段：

| 源 | 已用 | 丢弃的字段 |
|----|------|-----------|
| Crossref | title/author/abstract/year/doi/venue/type | **volume / issue / page / publisher / ISSN / container-title-short / language / URL / event** |
| OpenAlex | 同上 | biblio.{volume, issue, first_page, last_page} / primary_location.source.host_organization（publisher）/ language / open_access |
| Semantic Scholar | 同上 | journal.{name, volume, pages}（pages 字段已存在但未读） |
| arXiv | 同上 | 基本无（preprint 无卷页） |
| DBLP / OpenReview / DataCite | 同上 | DataCite 有 publisher；其余基本无 |

### 1.4 Zotero 同步（`zotero-client.ts` + `zotero-sync.ts`）

- `parseItemRecord()` 只取 title/abstract/venue/doi/arxivId/authorsJson/year。
- **丢弃**：`volume` / `issue` / `pages` / `publisher` / `url` / `language` / `date`（完整日期，不只年） / `series` / `rights` 等。
- BBT 导出的 `raw_bibtex` 里常有这些字段，但 import 时 `bibtex-parse.ts` 也只映射到现有 flat 列，**没解析进 csl_json**。

### 1.5 导出 / Agent

- `formatBibliography()` 只用 title/author/year/doi/venue 拼 CSL → **格式化参考文献缺卷页，IEEE/Chicago 等格式不完整**。
- `literature-cite` 工具依赖 `raw_bibtex`，fallback 模板只有 title/year —— 缺字段时 .bib 条目质量差。
- `literature-read` 工具 SELECT 的列不含 csl_json，Agent 拿不到扩展字段。

---

## 2. 设计决策

### 2.1 canonical 存储：扩展 `csl_json`，不堆 flat 列

**采用 CSL-JSON 作为扩展元数据的 canonical 存储**，而不是给每个字段加 DB 列。

理由：
- `csl_json` 列已存在，无需 schema 大改。
- CSL-JSON 是 citeproc / Zotero / Word 的通用格式，字段稳定且可扩展。
- 列表 / 排序 / 过滤仍用现有 flat 列（title、year、authors、venue、doi、arxiv_id），性能与索引不变。
- UI 按 entry type 渲染对应字段（journal → volume/issue/pages；conference → event/booktitle）。

**flat 列保持不变**，作为「索引面」。新增字段一律进 `csl_json`。

### 2.2 `BibliographicMetadata` 扩展

在 `shared/bibliographic-metadata/types.ts` 扩展可选字段（不破坏现有源实现）：

```ts
export interface BibliographicMetadata {
  // …现有字段…
  volume?: string | null;
  issue?: string | null;          // CSL "issue" / BibTeX "number"
  page?: string | null;           // CSL "page"（"first--last" 或单页）
  publisher?: string | null;
  url?: string | null;
  language?: string | null;
  containerTitleShort?: string | null;  // journal 缩写
  event?: string | null;          // conference / event 名（与 venue 互补）
  editors?: string | null;        // JSON，同 authors 格式
  note?: string | null;
}
```

源实现按能力填充，未提供即 `null` / 不出现。

### 2.3 `bibliographicToCslJson()` 完善

`helpers.ts` 的 `bibliographicToCslJson()` 写入全部已知字段：

```ts
{
  id, type, title, author,
  issued: { "date-parts": [[year]] },
  DOI, ISBN, abstract, "container-title",
  "container-title-short", volume, issue, page,
  publisher, URL, language, event, editor, note
}
```

**合并语义**（`resolver.ts` runChain）：现有「长 title/abstract 胜出」基础上，扩展字段用「先到先得 + 后到的非空覆盖空」。

### 2.4 UI 渲染策略

- 列表行不变（仍用 flat 列）。
- 展开面板新增「Publication details」区段，**从 `csl_json` 解析后按 type 渲染**：
  - journal article → Volume / Issue / Pages / Publisher / Journal abbrev.
  - conference paper → Booktitle / Event / Pages / Publisher
  - book → Publisher / Edition / ISBN / Pages
  - preprint → 仅 arXiv / DOI（无卷页）
- 字段值缺失则整行隐藏（不显示 `—` 占位，避免噪音），保持紧凑。
- 这些字段**只读展示**优先（Phase 1），可编辑放到 Phase 3（需要 csl_json 局部更新）。

### 2.5 不做的事

- **不加** volume/pages 等 flat 列。
- **不改**列表排序 / FTS 索引（仍按现有 flat 列）。
- **不做** Zotero 双向写回扩展字段（Phase 4 才考虑；现在 Zotero 是只读同步源）。

---

## 3. 分阶段实施

### Phase 1 — 源解析 + 存储（catalog → csl_json）

**目标**：enrich / addByDoi / addByArxiv / BibTeX import 时，把 volume/pages 等写进 `csl_json`，DB 里就有了完整扩展元数据。

改动文件：
1. `src/shared/bibliographic-metadata/types.ts` — 扩展 `BibliographicMetadata`（见 2.2）。
2. `src/shared/bibliographic-metadata/helpers.ts`
   - `bibliographicToCslJson()` 写入全部扩展字段。
   - `bibliographicToPaperPatch()` 不变（flat 列不变）。
   - 新增 `mergeBibliographicMetadata(prev, next)` 语义（或完善 resolver 合并）。
3. `src/shared/bibliographic-metadata/sources/crossref.ts` — 读 `volume` / `issue` / `page` / `publisher` / `ISSN` / `container-title-short` / `language` / `URL` / `event`。
4. `src/shared/bibliographic-metadata/sources/openalex.ts` — 读 `biblio.{volume, issue, first_page, last_page}` → 拼成 `page`；`language`；`primary_location.source.host_organization`。
5. `src/shared/bibliographic-metadata/sources/semantic-scholar.ts` — 读 `journal.{volume, pages}`。
6. `src/shared/bibliographic-metadata/sources/datacite.ts` — 已有 publisher，补 url/language。
7. `src/shared/bibliographic-metadata/resolver.ts` — 合并链对扩展字段做「非空覆盖」。
8. `src/main/services/literature-enrich.ts` — `enrichPaperFromCatalog` / `createPaperFromCatalog` 已写 csl_json，确认走完善后的 `bibliographicToCslJson()` 即可（基本无改动）。
9. `src/main/lib/bibtex-parse.ts` — BibTeX import 时，把解析出的 CSL 字段（volume/number/pages/publisher/url/booktitle/event/editor/note）一并构建 `BibliographicMetadata` → `bibliographicToCslJson()`，写入 `csl_json` 列（`literature-service.ts` 的 `importBibTeX` 路径需传 csl_json）。

验证：
- 单测：`tests/main/bibliographic-metadata.test.ts` 加用例——Crossref/OpenAlex/S2 样例 JSON → `BibliographicMetadata` 含 volume/page 等；`bibliographicToCslJson()` 输出含这些字段。
- 集成：用一个 NeurIPS DOI（如 `10.48550/arXiv.2312.16097` 或真实会议 DOI）走 addByDoi，检查 DB `csl_json` 含 page/event。

### Phase 2 — UI 只读展示

**目标**：展开面板按 type 渲染扩展字段，全部从 `csl_json` 读。

改动文件：
1. `src/renderer/modes/literature-mode/literature-entry-panel.tsx`
   - 新增「Publication details」区段（在 Authors 之后、Cite key 之前，或独立分组）。
   - 新增 `PublicationDetailsFromCsl({ cslJson, type })` 组件，按 type 渲染对应 `MetadataRow`。
2. `src/renderer/modes/literature-mode/literature-format.ts`（或新文件 `literature-csl-fields.ts`）
   - `parseCslJson(raw): CslJson | null`
   - `cslFieldsForType(type): Array<{ key, label }>` —— 决定该 type 显示哪些字段。
   - `formatPages(page)` —— `"1--12"` → `"1–12"`。
   - `formatVenueWithVolume(csl)` —— 派生显示串（可选）。
3. 渲染规则：
   - 字段值缺失 → 整行不渲染（不占位）。
   - journal article: Volume · Issue · Pages · Publisher · Journal abbrev.
   - paper-conference / inproceedings: Booktitle · Event · Pages · Publisher
   - book: Publisher · Edition · ISBN · Pages
   - 其余 type 只显示有的字段。

验证：
- `tests/renderer/literature-format.test.ts` 加 `parseCslJson` / `cslFieldsForType` / `formatPages` 用例。
- 手动：Phase 1 导入的论文在展开面板能看到卷页（如 journal article 显示 Vol. 5 · Issue 3 · pp. 1–12）。

### Phase 3 — Bibliography 导出 + Agent 工具暴露

**目标**：扩展字段进入参考文献导出和 Agent 工具返回值。

改动文件：
1. `src/main/services/literature-service.ts` — `formatBibliography()`
   - 改为从 `csl_json` 构建 CSL entries（fallback 到 flat 列）。
   - 注入 volume / issue / page / publisher / container-title-short / event / editor / note。
2. `src/main/tools/literature-read.ts` — SELECT 加 `csl_json`，返回里展开成结构化 `publication_details`（或直接返回 csl_json）。
3. `src/main/tools/literature-cite.ts` — fallback 模板（无 raw_bibtex 时）用 csl_json 拼更完整的 BibTeX 条目（volume/pages/publisher）。
4. `src/main/tools/literature-search.ts` — 检查返回字段是否需要带上 publication details（搜索结果通常用 flat 列即可，可选）。

验证：
- `tests/main/csl-bibliography.test.ts` 加用例：含 csl_json 的论文导出 IEEE/APA 时含 volume/pages。
- `tests/main/literature-cite-check.test.ts` 或新 `literature-cite.test.ts`：fallback BibTeX 含 volume/pages。
- Agent 工具：`literature-read` 返回值断言含 `publication_details`。

### Phase 4 — Zotero 同步读取扩展字段

**目标**：Zotero 同步时把 volume/pages 等写进 `csl_json`，不再只靠 BBT raw_bibtex。

改动文件：
1. `src/main/services/zotero-client.ts`
   - `ZoteroItemRecord` 扩展：volume / issue / pages / publisher / url / language / date(完整) / series / bookTitle / proceedingsTitle / editors。
   - `parseItemRecord()` 读 `data.volume` / `data.issue` / `data.pages` / `data.publisher` / `data.url` / `data.language` / `data.date` / `data.series` / `data.bookTitle` / `data.proceedingsTitle` / creators 里 creatorType='editor'。
2. `src/main/services/zotero-sync.ts` + `literature-service.ts`
   - `UpsertZoteroPaperInput` 增加可选 `cslJson?: string | null`（或扩展字段集合）。
   - `upsertZoteroPaperRow()` 在 INSERT/UPDATE 时写 `csl_json`。
   - `syncBoundZoteroCollection()` 调用时传入从 item 构建的 csl_json。
   - BBT raw_bibtex 若存在，优先用它构建 csl_json（字段更全），否则用 item data。

验证：
- `tests/main/zotero-sync.test.ts` 加用例：mock Zotero item 含 volume/pages → upsert 后 DB csl_json 含这些字段。
- `tests/main/zotero-client.test.ts` 加 `parseItemRecord` 扩展字段用例。

### Phase 5（可选，后续）— UI 可编辑 + Zotero 写回

非本次必须，列出以备后续：
- 展开面板的扩展字段可编辑（局部 patch csl_json）。
- 「Import to local」时保留扩展字段（已通过 csl_json 自动保留，主要是确认）。
- Zotero 写回扩展字段（需要 zotero-writer 支持 item field 更新，目前 writer 只做 collection）。

---

## 4. 实施顺序与依赖

```
Phase 1 (源 + 存储)  ──┐
                       ├─► Phase 2 (UI 只读)
                       │
                       └─► Phase 3 (导出 + Agent)
                       
Phase 4 (Zotero 读) ────► 依赖 Phase 1 的 csl_json 写入路径
```

- Phase 1 是基础，必须先做。
- Phase 2 / 3 可并行，但建议 Phase 2 先（能立刻看到效果）。
- Phase 4 依赖 Phase 1 的 csl_json 落库机制，可与 Phase 2/3 并行。

## 5. 测试策略

- **单元**：源解析（mock fetch 响应）→ `BibliographicMetadata` 字段断言；`bibliographicToCslJson` 字段断言；`parseCslJson` / `formatPages` / `cslFieldsForType`。
- **集成**：用真实 DOI 跑 addByDoi（可 mock catalog 响应）→ 查 DB `csl_json`。
- **回归**：现有 `bibliographic-metadata.test.ts` / `csl-bibliography.test.ts` / `literature-service.test.ts` / `zotero-sync.test.ts` 全绿。
- **手动**：导入一篇 journal article + 一篇 conference paper，展开面板看字段、导出 .bib 看 volume/pages、Agent `literature-read` 看返回。

## 6. 风险与注意

- **源字段差异大**：各源对 volume/page 命名不一（Crossref `page` 是 `"1-12"`，OpenAlex 是 `first_page`/`last_page`）。统一在 source 内归一化到 CSL `page`（`"first--last"`）。
- **合并冲突**：多源对同一字段可能给不同值（如 venue 缩写）。策略：高优先级源的非空值优先，低优先级只补空。现有 resolver 已有 merge，需扩展到新字段。
- **CSL type 与 BibTeX type 映射**：已有 `CSL_TO_BIBTEX_TYPE`；渲染按 CSL type，DB `type` 列已是 BibTeX 风格（`article`/`inproceedings`…），UI 渲染时需统一映射（用 CSL type 判断字段集合）。
- **`csl_json` 可能为 null**：旧数据 / 手动新建无 csl_json。UI 必须容忍 null，fallback 到 flat 列展示。
- **BibTeX import 路径**：`literature-service.importBibTeX` 当前不写 csl_json，需补。

## 7. 不在范围

- 列表行展示卷页（保持列表精简，扩展字段只在展开面板）。
- FTS 索引扩展字段（不必要）。
- Zotero 写回（Phase 5）。
- Word / 浏览器 connector 集成。
