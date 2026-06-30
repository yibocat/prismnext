# Chat Citation Staging — Implementation Plan

> 日期：2026-07-01
> Spec：`docs/superpowers/specs/2026-07-01-chat-citation-staging-design.md`
> 目标：让 Agent 引用的文献先进入「会话引用暂存区」，用户核对后再加入文献库，避免「合法 DOI 加错文」。

## 阶段总览

| Phase | 目标 | 关键文件 |
|-------|------|----------|
| 1 | 类型 + Staging store + IPC verify-only | `stores/citation-staging-store.ts`, `types/electron.d.ts` |
| 2 | `literature-stage` 工具 + bridge `stage` action | `main/tools/literature-stage.ts`, `services/literature-bridge.ts` |
| 3 | Literature 「本会话引用」子视图 + StagedCitationEntryPanel | `modes/literature-mode/literature-session-citations.tsx` |
| 4 | Chat 内联 `[n]` 渲染 + 跳转 | `components/modules/chat/inline-tokens/` |
| 5 | 「加入文献库」操作 + 刷新 + dedupe | `stores/citation-staging-store.ts` actions |
| 6 | 测试 + tsc + pnpm test | `tests/main/`, `tests/renderer/` |

---

## Phase 1 — 类型 + Staging store

**目标**：建立数据模型与 renderer 状态家，无 UI、无工具。

### 1.1 共享类型

新增 `src/shared/citation-staging.ts`：

```ts
export interface StagedCitation {
  id: string;
  refId: number;
  sessionId: string;
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  type: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  cslJson: Record<string, unknown> | null;
  sourceUrl: string | null;
  catalogSource: string | null;
  catalogVerified: boolean;
  verifyError: string | null;
  discoveredFrom: "websearch" | "webfetch" | "user" | "agent";
  libraryPaperId: string | null;
  libraryBibkey: string | null;
  addedToLibrary: boolean;
  addedAt: number | null;
  createdAt: number;
}
```

### 1.2 Staging store

新增 `src/renderer/stores/citation-staging-store.ts`（Zustand + persist 到 localStorage）：

| State | 说明 |
|-------|------|
| `bySession: Record<string, StagedCitation[]>` | 按 sessionId 索引 |
| `activeSessionId: string \| null` | 当前 chat tab |

| Action | 说明 |
|--------|------|
| `setActiveSession(sessionId)` | 切换 chat tab 时调 |
| `upsertFromStageResult(sessionId, payload)` | 接收 bridge stage 结果，分配 refId，查库关联 |
| `markAddedToLibrary(id, paperId, bibkey)` | 入库成功后回填 |
| `removeBySession(sessionId)` | 关闭 chat tab / 清空 |
| `clearAll()` | 切换项目时调 |

**Persist**：仅 persist `bySession`；`activeSessionId` 运行时维护。

### 1.3 与正式库的关联查询

`upsertFromStageResult` 内部：

```ts
const existing = await window.electronAPI.literatureFindExisting({
  projectRoot, doi, arxivId,
});
// existing: { paperId, bibkey } | null
```

**需要新增 IPC** `literature:findExisting`（main）：纯读 `library.db`，按 DOI / arXiv ID 查 papers 表，命中返回 `{ paperId, bibkey }`。

- `src/main/ipc/literature.ts` 加 handler
- `src/preload/index.ts` + `src/renderer/types/electron.d.ts` 加类型
- `src/main/services/literature-service.ts` 加 `findExistingByIdentifier(projectRoot, { doi, arxivId })`

### 1.4 测试

- `tests/renderer/citation-staging-store.test.ts`：upsert 分配 refId、markAddedToLibrary、removeBySession。
- `tests/main/literature-service.test.ts` 增加 `findExistingByIdentifier` 用例。

---

## Phase 2 — `literature-stage` Agent 工具 + bridge

**目标**：Agent 调用 `literature-stage` 返回 verified 元数据，不写库。

### 2.1 Bridge `stage` action

`src/main/services/literature-bridge.ts`：

1. 新增 `action: "stage"`，类型扩展到 `LiteratureBridgeRequest`。
2. `handleStage(projectRoot, sessionId, payload)`：
   - `normalizeDoi` / `normalizeArxivId`，非法 → `{ staged: false, verified: false, error }`。
   - `resolveBibliographicMetadata({ doi, arxivId })`（已存在，纯只读）。
   - `bibliographicToPaperPatch(metadata)` 转成 StagedCitation 子集。
   - 查 `findExistingByIdentifier` 关联正式库。
   - **分配 refId**：读取该 sessionId 下已有 staging 文件目录 `~/.prism-literature-bridge/<session>/staging.json`，`max(refId)+1`。
   - 返回 `{ staged: true, verified: true, refId, citation, alreadyInLibrary, libraryBibkey, hint }`。

> refId 持久化：bridge 维护 `staging.json`（sessionId 级），记录 `{ refId, doi, arxivId }` 列表，确保同一会话多次 stage 复用 refId。renderer store 同步这份 refId。

### 2.2 `literature-stage` 工具

新增 `src/main/tools/literature-stage.ts`，仿 `literature-add.ts`：

- args: `doi?` / `arxivId?` / `title?` / `sourceUrl?`
- bridge payload: `{ action: "stage", sessionId, doi, arxivId, title, sourceUrl }`
- 返回 `{ output: JSON }`

### 2.3 注册

- `src/main/tools/index.ts` → `BUILTIN_TOOLS` 加 `literature-stage`。
- `src/main/services/tool-permission-registry.ts` → `literature-stage: { permissionGroup: "read", confirmUx: "none", rules: READ_ONLY }`。
- `src/main/acp/tool-name-infer.ts` → `inferToolNameFromInput` 加分支：有 `doi/arxivId` + 有 `sourceUrl` 或无 `bibkey/query` → `literature-stage`（与 `literature-add` 区分：add 是用户显式入库意图，stage 是默认引用）。
  - **简化规则**：`literature-add` 与 `literature-stage` 都靠 ACP tool_name 直传，infer 仅作 fallback；fallback 默认走 `literature-stage`（更安全）。
  - `resolveLiteratureToolTitle` 正则加 `stage`。
- `src/renderer/components/modules/chat/tools/index.tsx` + `literature-tool-widget.tsx` → 加 `literature-stage` 标签与字段渲染。

### 2.4 Prompt

`src/main/prompts/modules/citations.ts` 更新：

```
- 搜到 DOI/arXiv 后 **先 literature-stage**，在回复里用 [n] 引用 refId。
- 未经用户明确要求「加入文献库」，禁止直接 literature-add。
- stage 返回 verified=false 时，向用户求助，不要猜测 identifier。
```

### 2.5 测试

- `tests/main/literature-bridge.test.ts` 加 stage 用例（mock `resolveBibliographicMetadata` + `findExistingByIdentifier`）。
- `tests/main/tool-name-infer.test.ts` 加 stage 分支。

---

## Phase 3 — Literature 子视图 + EntryPanel

**目标**：在 Literature 模式内切换「文献库 / 本会话引用」，列出 staged citations。

### 3.1 子视图切换 state

`literature-store.ts` 加：

```ts
librarySubview: "library" | "session-citations";
setLibrarySubview: (v) => void;
```

（不 persist，默认 `library`。）

### 3.2 `literature-content.tsx` 顶部分段控件

```tsx
<Tabs value={librarySubview} onValueChange={setLibrarySubview}>
  <TabsTrigger value="library">文献库</TabsTrigger>
  <TabsTrigger value="session-citations">
    本会话引用 {pendingCount > 0 && <Badge>{pendingCount}</Badge>}
  </TabsTrigger>
</Tabs>
{librarySubview === "library" ? <LiteratureLibrary /> : <LiteratureSessionCitations />}
```

`pendingCount` = `useCitationStagingStore` 当前 session 中 `addedToLibrary === false` 的条数。

### 3.3 `LiteratureSessionCitations`

新增 `src/renderer/modes/literature-mode/literature-session-citations.tsx`：

- 读 `useCitationStagingStore.bySession[activeSessionId]`。
- 复用 `LiteratureLibrary` 的表格 chrome（`literature-list-chrome.ts` 的 `TableHeader`、行布局、展开动画 hook）。
- 行数据用 `StagedCitation`，列：`#refId` · Title · Authors · Year · DOI/arXiv chip · 状态 chip。
- 行展开 → `<StagedCitationEntryPanel citation={c} />`。
- 顶部操作：「全部加入文献库」「清空本会话引用」。
- 空状态：提示文案 + 图示。

### 3.4 `StagedCitationEntryPanel`

新增 `src/renderer/modes/literature-mode/literature-staged-entry-panel.tsx`：

- 复用 `MetadataRow`、`PublicationDetailsFromCsl`、`formatLiteratureAuthors`、`formatEntryType`、`formatPaperProvenance`。
- 如这些组件未导出，**先在 `literature-entry-panel.tsx` 内 export**，再 import，不复制粘贴。
- 顶部操作条：
  - `addedToLibrary === false` → `Button: 加入文献库`（调 store action，loading 状态）
  - `addedToLibrary === true` → `Button: 在文献库中打开`（`openLiteraturePaper(libraryPaperId)`）
- 字段：Title · Type · Provenance(catalogSource) · Year · Venue · Authors · DOI(链接) · arXiv(链接) · Abstract · PublicationDetails(CSL)。
- 不渲染：编辑按钮、Zotero 操作、PDF 下载（staged 无 PDF）、笔记区。

### 3.5 测试

- `tests/renderer/literature-session-citations.test.ts`：渲染空状态、列表、展开、状态 chip。
- `tests/renderer/literature-staged-entry-panel.test.ts`：「加入文献库」按钮回调。

---

## Phase 4 — Chat 内联 `[n]` 渲染 + 跳转

**目标**：正文 `[n]` 可点击跳到对应 staged citation。

### 4.1 渲染拦截

在 chat markdown inline token 处理（参考 `inline-token-parts.tsx`）加一个 `citation-ref` token：

- 正则 `/\[(\d+)\]/g`。
- 仅当 `useCitationStagingStore.bySession[messageSessionId]` 存在 `refId === n` 时渲染为按钮；否则按普通文本 `[n]` 渲染（避免误伤数学/普通方括号）。

### 4.2 CitationRef 组件

新增 `src/renderer/components/modules/chat/inline-tokens/citation-ref.tsx`：

```tsx
export function CitationRef({ n, sessionId }: { n: number; sessionId: string }) {
  const exists = useCitationStagingStore(s =>
    s.bySession[sessionId]?.some(c => c.refId === n)
  );
  if (!exists) return <span>[{n}]</span>;
  return (
    <button
      className="citation-ref"
      onClick={() => jumpToStagedCitation(sessionId, n)}
    >
      [{n}]
    </button>
  );
}
```

### 4.3 `jumpToStagedCitation`

`src/renderer/lib/literature/jump-to-staged-citation.ts`：

1. `useRightPanelStore` 切到 literature tab（找现有 `kind === "literature"` 且非 paper reader 的 tab，或新建）。
2. `useLiteratureStore.setLibrarySubview("session-citations")`。
3. `useCitationStagingStore.setActiveSession(sessionId)`。
4. 滚动 + 高亮：在 `LiteratureSessionCitations` 用 `data-ref-id={n}` 标记行，jump 时 `scrollIntoView({ block: "center" })` + 临时加 `ring` class。

### 4.4 sessionId 传递

chat message 渲染处已有 message 所属 chat tab id；传给 `CitationRef`。
若无法获取，从 `useChatStore` 当前 active tab 取（fallback）。

### 4.5 测试

- `tests/renderer/citation-ref.test.ts`：存在/不存在 refId 两种渲染。
- `tests/renderer/jump-to-staged-citation.test.ts`：mock store，断言调用顺序。

---

## Phase 5 — 「加入文献库」action

**目标**：用户确认后将 staged citation 写入 `library.db`。

### 5.1 store action

`citation-staging-store.ts`：

```ts
addToLibrary: async (id: string) => {
  const c = findCitation(id);
  if (!c.doi && !c.arxivId) throw new Error("No DOI/arXiv ID");
  const result = await window.electronAPI.literatureCreateFromIdentifier(
    projectRoot, { doi: c.doi ?? undefined, arxivId: c.arxivId ?? undefined }
  );
  // result.duplicateReason 命中时也返回已有 paper
  markAddedToLibrary(id, result.paper.id, result.paper.bibkey);
  await useLiteratureStore.getState().bootstrapLiterature(projectRoot);
  return result;
}
```

### 5.2 「全部加入文献库」

`addAllToLibrary(sessionId)`：串行调 `addToLibrary`，统计成功/失败，toast 汇总。

### 5.3 错误处理

- catalog error → `verifyError` 字段，UI 显示红色 chip + 错误信息 tooltip。
- 网络错误 → toast，按钮恢复可点。

### 5.4 测试

- mock `literatureCreateFromIdentifier`，断言 `markAddedToLibrary` 调用 + `bootstrapLiterature` 触发。

---

## Phase 6 — 测试 + 验证

### 6.1 测试清单

| 文件 | 用例 |
|------|------|
| `tests/main/literature-bridge.test.ts` | stage 成功 / stage 无效 DOI / stage catalog miss / stage 命中已有库条目 |
| `tests/main/literature-service.test.ts` | `findExistingByIdentifier` 命中 / 未命中 |
| `tests/main/tool-name-infer.test.ts` | `literature-stage` 推断 |
| `tests/renderer/citation-staging-store.test.ts` | upsert refId 分配、markAdded、remove、clearAll |
| `tests/renderer/literature-session-citations.test.ts` | 空状态、列表渲染、状态 chip、行展开 |
| `tests/renderer/literature-staged-entry-panel.test.ts` | 加入按钮回调、已入库状态 |
| `tests/renderer/citation-ref.test.ts` | refId 存在/不存在渲染分支 |

### 6.2 验证命令

```bash
cd prism-next
npx tsc --noEmit
pnpm test
```

### 6.3 手动验证

1. 重启 Prism + 新开 chat tab。
2. 让 Agent 搜一篇真实论文（如 "Attention Is All You Need"）→ 应调 `literature-stage`，回复出现 `[1]`。
3. 点击 `[1]` → RightArea Literature 切到「本会话引用」，行展开显示元数据。
4. 点「加入文献库」→ toast 成功，状态变「已入库」。
5. 切到「文献库」子视图 → 该条目已出现。
6. 让 Agent 「把 [1] 加进库」→ 应调 `literature-add`（已入库，返回 duplicate）。
7. 给 Agent 假 DOI `10.9999/fake` → stage 返回 `verified: false`，不渲染 `[n]`，Agent 应回退求助。

---

## 顺序与依赖

```
Phase 1 (types + store + IPC)
  → Phase 2 (tool + bridge stage)
  → Phase 3 (UI 子视图 + entry panel)
  → Phase 4 (chat [n] 渲染)  ← 依赖 Phase 3 的子视图存在
  → Phase 5 (入库 action)    ← 依赖 Phase 3 的按钮 + Phase 1 的 store
  → Phase 6 (测试 + 验证)
```

Phase 1-2 可独立提交；Phase 3-5 可作为一个 PR；Phase 6 贯穿。

## 风险与回退

- **`literature-stage` 与 `literature-add` infer 冲突**：fallback 默认 stage，add 依赖 ACP 显式 tool_name。若 Agent 仍误用 add，靠 prompt + inline 确认拦。
- **`LiteratureEntryPanel` 组件未导出**：先做小重构导出，不改其行为；如导出风险大，则 `StagedCitationEntryPanel` 自包含渲染（容忍少量重复）。
- **localStorage 持久化与多窗口**：初版只在主窗口维护，多窗口共享暂不处理。
- **refId 分配竞争**：bridge `staging.json` 读写串行化（单进程 poll，无并发）。
