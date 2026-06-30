# Chat Citation Staging — 会话引用暂存与展示

> 日期：2026-07-01
> 范围：Agent 在 Chat 中引用的文献，先进入「会话引用暂存区」供用户核对，再决定是否加入项目文献库。
> 关联：`2026-06-30-literature-integration-plan.md`（Phase 2 Agent）、`2026-06-29-literature-reader-design.md`

## 1. 动机

`literature-add` 只能保证 DOI/arXiv **合法且能在目录查到**，不能保证 Agent 选的就是用户想要的那篇。
典型失败路径：

```
用户要论文 A → Agent websearch 误选 B → 复制 B 的合法 DOI → literature-add 通过校验 → 库里多了 B
```

DOI 校验防的是「编造 identifier」，不防「选错论文」。需要把 **发现 / 暂存 / 展示 / 确认入库** 拆成独立阶段，让用户在入库前用眼睛核对 title / authors / year。

## 2. 目标

1. **AI 在回复里引用文献时**，结构化带出 `citations[]`，正文用 `[n]` 占位。
2. **`[n]` 可点击**，跳转到 RightArea Literature 的「本会话引用」子视图并展开对应条目。
3. **会话引用面板**复用 `LiteratureLibrary` 列表 + `LiteratureEntryPanel` 的只读视图，外观与正式库一致。
4. **每条引用可选「加入文献库」**，调用现有 `createPaperFromCatalog`；已在库的显示「已在文献库 · 打开」。
5. **Agent 不再自动入库**：默认走 `literature-stage`，由用户确认后再 `literature-add` / 点击入库。

## 3. 非目标

- 不做 Chat 内联富文本编辑器。
- 不替换 websearch 工具，websearch 仍负责发现。
- 不改 `library.db` schema；暂存条目不进 SQLite。
- 不做跨会话引用聚合（每个 chat tab 独立暂存）。
- 不做引用去重到全局「已读列表」（reading_list 以后再说）。

## 4. 数据模型

### 4.1 StagedCitation（renderer store，不进 SQLite）

```ts
interface StagedCitation {
  id: string;                  // 内部稳定 id（uuid 或 `${sessionId}-${n}`）
  refId: number;               // 会话内编号，对应正文 [n]；从 1 开始
  sessionId: string;           // chat tab id
  // 元数据（catalog 解析后的快照，离线可读）
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  type: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  cslJson: Record<string, unknown> | null;
  sourceUrl: string | null;    // 来源页面（websearch 结果 / arXiv abs 页）
  catalogSource: string | null;// crossref / arxiv / openalex / …
  catalogVerified: boolean;    // 是否已走外部目录校验
  verifyError: string | null;  // 校验失败原因
  discoveredFrom: "websearch" | "webfetch" | "user" | "agent";
  // 与正式库的关联（命中已有条目时填充）
  libraryPaperId: string | null;
  libraryBibkey: string | null;
  // 生命周期
  addedToLibrary: boolean;     // 用户已点「加入文献库」
  addedAt: number | null;      // ms timestamp
  createdAt: number;
}
```

**存储位置**：`useLiteratureStore`（或新建 `useCitationStagingStore`）持有 `Map<sessionId, StagedCitation[]>`；
按 chat tab 持久化到 `localStorage`（key: `prism.citation-staging.<sessionId>`），避免刷新丢失。
**不**写 `.prismnext/`，不污染项目目录。

### 4.2 与正式库的关联

打开 chat tab / 新增引用时，按 `doi || arxivId` 在 `library.db` 查一遍：
- 命中 → `libraryPaperId / libraryBibkey` 填充，`addedToLibrary = true`，UI 显示「已在文献库」。
- 未命中 → `addedToLibrary = false`，UI 显示「加入文献库」按钮。

用户点「加入文献库」成功后回填这两个字段。

## 5. Agent 工具：`literature-stage`

新增 OpenCode 工具，与 `literature-add` 并列，但 **只校验、不入库**。

| 维度 | `literature-stage`（新，默认） | `literature-add`（保留，显式） |
|------|----------------------------|---------------------------|
| 输入 | `doi?` / `arxivId?` / `title?`（fallback） | `doi?` / `arxivId?` |
| 行为 | `resolveBibliographicMetadata` → 返回元数据快照 | `createPaperFromCatalog` → 写 `library.db` |
| 副作用 | 无（纯只读 + 写 bridge 返回） | 写库 + 可能下载 PDF |
| 权限 | `read`，无确认 | `file_write`，inline 确认 |
| 用途 | Agent 引用前先校验 | 用户明确说「加进库」 |

### 5.1 `literature-stage` 参数与返回

```ts
// args
{
  doi?: string;       // 与 arxivId 互斥
  arxivId?: string;
  title?: string;     // 仅当无 doi/arxivId 时作 fallback 搜索（catalog title search）
  sourceUrl?: string; // 可选，Agent 标注出处
}
```

返回（`{ output: JSON }`）：

```jsonc
{
  "staged": true,
  "verified": true,
  "refId": 3,                  // 由 bridge 分配的会话内编号
  "citation": {                // StagedCitation 子集（不含 sessionId / createdAt）
    "title": "...",
    "authors": "...",
    "year": 2024,
    "doi": "10.xxxx/...",
    "arxivId": null,
    "catalogSource": "crossref",
    "sourceUrl": "https://..."
  },
  "alreadyInLibrary": false,
  "libraryBibkey": null,
  "hint": "Cite as [3] in your reply. User will confirm before adding to library."
}
```

校验失败：

```jsonc
{
  "staged": false,
  "verified": false,
  "error": "DOI not found in catalogs",
  "hint": "Use websearch to confirm the identifier; do not invent DOIs."
}
```

### 5.2 Bridge action: `stage`

`literature-bridge.ts` 新增 `action: "stage"`：
1. `normalizeDoi` / `normalizeArxivId`，非法直接返回 `verified: false`。
2. `resolveBibliographicMetadata({ doi, arxivId })`（不写库）。
3. 解析成 `StagedCitation` 子集，按 sessionId 分配 `refId = max(existing) + 1`。
4. 查 `library.db` 是否已存在同 DOI/arXiv 条目，填充 `libraryPaperId / libraryBibkey`。
5. 写 result json 回 bridge。**不入 SQLite。**

> 备注：`resolveBibliographicMetadata` 已存在且为纯只读，无需新增 catalog 代码。

### 5.3 Prompt 规则（`citations.ts`）

```
- 搜到 DOI/arXiv 后 **先 literature-stage**，在回复里用 [n] 引用对应 refId。
- 未经用户明确要求（「加进库」「add to library」），**禁止直接 literature-add**。
- 若 stage 返回 verified=false，向用户说明并请求正确 identifier，不要猜测。
- 同一聊天会话内，重复 stage 同一 DOI 复用已有 refId（由 bridge 保证）。
```

## 6. UI 设计

### 6.1 Literature 模式子视图切换

`literature-content.tsx` 顶部加分段控件：

```
[ 文献库 | 本会话引用 (3) ]
```

- 「文献库」= 现有 `LiteratureLibrary`（默认）。
- 「本会话引用」= 新 `LiteratureSessionCitations`，按当前 chat tab 的 `sessionId` 取数据。
- 计数 badge = 当前会话 `addedToLibrary === false` 的条数（待确认数）。

**当前 sessionId 来源**：右键 chat tab / chat tab metadata 已有；如缺，从 `useChatStore` 当前 active tab 取。

### 6.2 会话引用列表（`LiteratureSessionCitations`）

复用 `LiteratureLibrary` 的表格 + 展开交互，但：

| 元素 | 行为 |
|------|------|
| 列 | `refId (#)` · Title · Authors · Year · DOI/arXiv · 状态 chip |
| 状态 chip | `已入库` / `待确认` / `校验失败` |
| 行展开 | 复用 `LiteratureEntryPanel` 的 **只读** 视图（隐藏编辑按钮、Zotero 操作、PDF 下载按钮可选保留） |
| 展开底部主操作 | **加入文献库**（`addedToLibrary=false` 时） / **打开文献库条目**（`addedToLibrary=true` 时） |
| 顶部操作 | 「全部加入文献库」「清空本会话引用」 |

空状态文案：「AI 在本会话中引用的文献会出现在这里，点击 [n] 可跳转。」

### 6.3 `LiteratureEntryPanel` 复用策略

为避免给已写好的面板加一堆 `if (staging)` 分支，**新建 `StagedCitationEntryPanel`**：

- 内部组合 `MetadataRow`、`PublicationDetailsFromCsl`、`formatLiteratureAuthors` 等已有原子组件（导出复用）。
- 不调 `updatePaper` / `deletePaper` / `importToLocal`。
- 顶部固定一个操作条：
  - `addedToLibrary=false` → `Button: 加入文献库`（loading 状态）
  - `addedToLibrary=true` → `Button: 在文献库中打开`（调用 `openLiteraturePaper(libraryPaperId)`）
- DOI/arXiv 链接、abstract、publication details 全部只读展示。

> 若发现 `LiteratureEntryPanel` 内部组件未导出，先做小重构导出，再在 staging 面板复用——**不**复制粘贴大段 JSX。

### 6.4 Chat 内联 `[n]` 渲染

在 chat message 渲染层（markdown → React）拦截 `[n]` token：

- 正则：`/\[(\d+)\]/g`，匹配 `[{n}]`。
- 渲染为 `<button class="citation-ref">[n]</button>`，点击：
  1. 切到 RightArea Literature tab。
  2. 切到「本会话引用」子视图。
  3. 滚动 + 高亮对应 `refId === n` 的行，自动展开。

> 实现位置：现有 chat markdown renderer 的 inline token 处理（参考 `inline-token-parts.tsx`）。
> 仅渲染 `refId` 已存在于 staging store 的 `[n]`，避免误伤普通方括号文本。

### 6.5 Agent 工具 widget

`literature-tool-widget.tsx` 已支持 `literature-stage` 的 `doi/arxivId/title` 显示；新增 `verified / refId / catalogSource` 字段渲染：

```
🔍 literature-stage · doi: 10.xxxx/...
  ✓ verified · ref [3] · crossref
```

## 7. 入库流程（「加入文献库」）

```
点击「加入文献库」
  → literatureStore.addToLibrary(stagedId)
  → window.electronAPI.literatureCreateFromIdentifier(projectRoot, { doi, arxivId })
  → 成功：
     - staged.addedToLibrary = true
     - staged.libraryPaperId = result.paper.id
     - staged.libraryBibkey = result.paper.bibkey
     - 触发 literatureStore.bootstrapLiterature() 刷新正式库
     - toast: "已加入文献库：smith2024"
  - 失败（duplicateReason）：
     - 视为已入库，按 result.paper.id 回填字段
     - toast: "已在文献库中：smith2024"
  - 失败（catalog error）：
     - staged.verifyError = message
     - toast: error
```

**去重**：依赖 `createPaperFromCatalog` 已有的 DOI/arXiv duplicate 检测，不在 renderer 重复实现。

## 8. 生命周期与清理

- 切换 chat tab → 子视图切换到对应 sessionId 的列表。
- 关闭 chat tab → 该 sessionId 的 staging 数据**保留 N 天**（localStorage），之后清理；或随 chat tab 关闭立即清理（**初版选立即清理**，简单）。
- 用户主动「清空本会话引用」→ 移除该 sessionId 全部条目。
- 项目切换 → 清空所有 staging（与项目绑定，跨项目引用无意义）。

## 9. 权限与安全

- `literature-stage`：`permissionGroup: "read"`，`confirmUx: "none"`（纯只读，无副作用）。
- `literature-add`：保持现状 `file_write` + inline 确认。
- Staging 数据无敏感信息，localStorage 可接受。
- Agent prompt 明确「禁止未经确认入库」，作为软约束；硬约束是 `literature-add` 的 inline 确认 UI。

## 10. 验收标准

1. Agent 回复正文出现可点击 `[n]`，点击跳到 Literature「本会话引用」并展开对应条目。
2. 会话引用面板列出本次对话所有 staged citations，含 title/authors/year/doi/状态。
3. 点击「加入文献库」成功后，`library.db` 出现该条目，且面板状态变为「已入库」。
4. Agent 默认调用 `literature-stage`，不直接 `literature-add`（除非用户明确要求入库）。
5. `literature-stage` 返回 `verified: false` 时，不入库、不渲染 `[n]`，Agent 应回退求助用户。
6. 切换 chat tab / 切换项目时，子视图正确切换或清空。
7. `pnpm test` 通过；新增 `literature-bridge` stage 用例、`citation-staging-store` 用例。

## 11. 后续（不在本 spec 范围）

- 引用跨会话聚合（reading_list 复用）。
- Staged citation → 生成 `.bib` 草稿条目。
- TeX 工作区 `\cite{}` 自动补全候选纳入 staged citations。
- 引用按章节分组、导出为参考文献清单。
