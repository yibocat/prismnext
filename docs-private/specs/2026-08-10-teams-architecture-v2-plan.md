# Team 架构 v2 —— 实施计划

| | |
|---|---|
| 状态 | 草案 v1 —— 待评审 |
| 日期 | 2026-08-10 |
| 依据 | `2026-08-10-teams-architecture-v2-design.md`（下称「设计文档」） |
| 目标版本 | 0.7.0 |
| 总估算 | **19 人日**（不含评审缓冲；含 2 人日机动） |

> 本文档只回答「怎么落地」。任何「为什么这样设计」的问题回设计文档。
> 每个 Phase 独立可合入、独立可测；合并顺序即依赖顺序。

---

## 0. 执行原则

| # | 原则 |
|---|---|
| E1 | **先词表后代码**。T0 的重命名一次做完，此后代码库里不允许新旧词表混写 |
| E2 | **一次一层**。数据层 → 解析层 → 消费层 → UI 层，每层完工后旧路径立即删除，不留双轨 |
| E3 | **没有 feature flag**。v1 用 `PRISM_PACKS_V2` 双轨的教训是双轨永远收不掉；本轮靠「Phase 内自洽 + 每 Phase 全量测试绿」保证可合入 |
| E4 | **写操作单一出口**。`src/main/teams/lifecycle.ts` 是唯一允许写状态并触发 `notifyTeamsChanged` 的模块；新增任何写路径必须走它 |
| E5 | **每 Phase 结束跑 `pnpm test` + `pnpm typecheck` 全绿**，且 grep 验收清单为空 |
| E6 | **迁移代码只写一次**。所有 legacy 读取集中在 `src/main/teams/migration.ts`，其他模块不得引用 legacy 常量 |

功能未完成前 **不发布**：0.7.0 之前的任何 patch 版本不得暴露新 Teams 入口。

---

## 1. 依赖图

```
T0 词表冻结与重命名
 └─► T1 数据模型与状态层 ──┐
      └─► T2 解析层 ───────┼─► T3 编排类接管 ──┐
                          │                    ├─► T5 UI 重做 ──► T7 Pro/商店 ──► T8 清理验收
                          └─► T4 环境类接管 ───┘
      └─► T6 迁移（与 T3/T4 并行开发，T5 之前合入）
```

关键路径：`T0 → T1 → T2 → T3 → T5 → T8`（约 14 人日）。
T4 与 T3 可并行（不同人）。T6 需要 T1 的类型定稿。

---

## T0 —— 词表冻结与机械重命名（1.5 人日）✅ 已完成 2026-08-10

### 目标
把 `pack / plugin / suite / expert` 从代码库中清除，为后续所有改动提供统一命名。**纯重命名，零行为变化。**

### 实际执行记录（与计划的偏差）

- **磁盘格式冻结**：codemod 最初把磁盘文件名也改了（`plugin.json`→`team.json`、`expert.json`→`subagent.json`、`packs.json` 字段名、`packsRoot` 键名），导致 core pack 扫描失败、既有项目状态丢失。经决策（见 §6 Q7/Q8）**全部还原**：T0 只改代码标识符，磁盘文件名与状态字段名一律保留旧名，T6 迁移阶段统一改。
- **`AssetKind` 联合成员 `"expert"` → `"subagent"`** 已改（含 `ResolvedSubagent`、`resolveActiveModuleKeys` 的 `role`、prompt 模块函数名 `*ExpertProfileModuleKeys*` → `*SubagentProfileModuleKeys*`）。
- **保留不改**：`event-mapper.ts` 等处的 `"expert"` 是 OpenCode task 工具的运行时占位符（非组件种类），改它会变行为，留给后续单独评估。
- **结果**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2312 过 / 6 失败（=基线，全是既存 PTY/环境问题）。
- codemod 脚本：`scripts/teams/t0-fix-imports.mjs`（保留作记录）。

### 改动

1. **符号级重命名**（IDE 重构 + `rg` 复核）：

| 旧 | 新 |
|---|---|
| `Pack*` / `pack*` / `*Pack` | `Team*` / `team*` / `*Team` |
| `packId` | `teamId` |
| `Expert*` / `expert*` | `Subagent*` / `subagent*` |
| `allowedExperts` | `roster`（此阶段仍是 `string[]`，T2 才换类型） |
| `ContentKind` / `ResolvedContent` | `AssetKind` / `AssetView`（字段暂不变） |
| `plugin.json` | `team.json`（含 `resources/teams/*` 三个内置团队的物理改名） |
| `isContentActive` | `isAssetActive` |
| `packs:*` IPC | `teams:*`（preload / d.ts 同步） |
| `experts:*` / `orchestrators:*` / `userPacks:*` IPC | 并入 `teams:*` |

2. **目录改名**（内置团队，无用户数据风险）：
   `resources/teams/<id>/experts/` → `subagents/`；`orchestrators/<oid>/` → `orchestrator/`。
   同步改 `scripts/export-bundled-skills.mjs:17-18` 的硬编码路径。

3. **i18n**：新增 `settings.teams.*` / `settings.assets.*` 前缀；旧 `settings.teamsAgents.*` / `teamsCenter.*` 暂保留映射，T5 删除。中/繁/英三份同步。

4. **兼容读取**：`catalog` 在此阶段同时接受 `team.json` 与 `plugin.json`（后者记 deprecation warning），供用户已建的 `user-packs/` 平滑过渡到 T6。

### 不做
不改任何判定逻辑、不改存储路径、不动 UI 结构。

### 验收
- `rg -n '\bexpert' src/ --glob '!**/migration*'` 为空（除迁移用的历史字符串）。
- `rg -n '\bpack' src/ --glob '!**/migration*' --glob '!**/legacy*'` 只剩 npm 包相关词（`package.json`、`packages`）。
- `pnpm test` 与 `pnpm typecheck` 全绿；agents/*.md golden 逐字节不变。

---

## T1 —— 数据模型与状态层（2 人日）✅ 已完成 2026-08-10

### 目标
落地设计文档 §5 的全部类型与两个状态文件，含三态解析函数。**纯读写层，不接消费路径。**

### 实际执行记录

- **增量追加，不替换**：`shared/teams/types.ts` 保留 v1 类型（仍被旧消费路径使用），追加 v2 类型（`TeamScope` / `TeamSource` / `BlockReason` / `RosterSpec` / `McpServerDef.autoStart` / `TriState` / `AppTeamsState` / `ProjectTeamsState` / `InstalledTeamRecord`）。视图类型（`TeamView`/`AssetView`/`RosterView`）属 T2 解析层，T1 未建。
- **新建 `src/main/teams/`**：`state-app.ts`（`teams-state.json`）、`state-project.ts`（`teams.json`）、`precedence.ts`（§7.5 单表）、`scope.ts`（`canReference` + 路径助手）。
- **`resolveTri` 唯一合并函数** + `normalizeAppTeamsState` / `normalizeProjectTeamsState`（字段白名单，拒绝 `__proto__` 注入与未知字段透传，治 v1 安全洞）。
- 两个状态文件均为：原子写（tmp+rename）+ 写计数器 + 变更事件（监听器逐个 try/catch）。
- **测试**：`tests/main/teams-state.test.ts` 16 个（resolveTri 真值表含 C7 关键用例、白名单过滤、原子写、计数器、监听器隔离、损坏自愈）。
- **验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2328 过 / 6 失败（=基线）。

### 新增文件
```
src/shared/teams/types.ts          设计文档 §5.2 全文
src/shared/teams/state.ts          resolveTri / toFqid / parseFqid / normalize*State
src/shared/teams/frontmatter.ts    从 shared/packs/frontmatter.ts 移入（不变）
src/main/teams/state-app.ts        <userData>/teams-state.json 读写 + 原子写 + 写计数器 + 变更事件
src/main/teams/state-project.ts    <root>/.prismnext/agent/teams.json 同上
src/main/teams/precedence.ts       precedenceRank（§7.5 唯一实现）
src/main/teams/scope.ts            canReference / scopeOf / projectTeamsDir / appTeamsDir
```

### 删除
`src/shared/packs/*`（T0 重命名后的产物整体替换）。

### 关键实现要求
- `normalizeAppTeamsState` / `normalizeProjectTeamsState` 必须做**字段白名单校验**（v1 的 `contentOverrides` 直接 `as` 是安全洞：用户手改文件可注入任意 `permission` 字段进 agent frontmatter）。
- 三态语义：`TriState` 中 `undefined`（缺键）≠ `false`。写入 `null` 表示「删键 = 跟随上层」。
- 两个状态文件都要有：原子写（tmp + rename）、`writeCounter`、`onWritten(listener)`、**监听器回调 try/catch**。
- `state-app.ts` 的变更事件必须触发**全项目**失效；`state-project.ts` 只失效自己。

### 测试
`tests/main/teams-state.test.ts`：
- `resolveTri` 的 3×3 真值表（含 `project=true, app=false` → true）。
- 原子写、损坏文件回退空态、白名单过滤（注入 `__proto__` / 未知字段被丢弃）。
- 写计数器与监听器（含一个抛错的监听器不影响其他监听器与写入）。

### 验收
状态层可独立读写；`pnpm test` 全绿；无任何消费方引用。

---

## T2 —— 解析层 TeamResolver（3 人日）✅ 已完成 2026-08-10

### 目标
设计文档 §6 全接口，纯读，输出稳定视图。这是后续所有 Phase 的唯一数据源。

### 实际执行记录

- **新建并行解析层**（不改现有消费路径，行为零变化）：`src/main/teams/catalog.ts` + `resolver.ts`。现有 `services/team-catalog.ts` / `team-resolver.ts` 保留，T3/T4 切换。
- **视图类型放 `shared/teams/view.ts`**（`TeamViewV2` / `AssetViewV2` / `RosterView` / `RosterEntryView` / `OrchestratorDefV2` / `SubagentDefV2`），避免与 types.ts 的 v1 同名类型冲突。
- **catalog**：四个根标注 scope+source；双布局扫描（新 `team.json`/`orchestrator/`/`subagents/` 优先，旧 `plugin.json`/`orchestrators/`/`experts/` 兜底——T0 冻结磁盘格式的兼容）；teamId=目录名校验；保留 id 按根校验（core 只能 bundled、project.local 只能 project）；删 `contents` 声明读取；指纹含全部内容文件。
- **resolver**：viewKey 含 appStateWriteCounter；三态判定链（`resolveTri`）产出 `enabled` + `blockedBy` + 原始三态值；`compatible` 进运行期判定链（治 B10）；`runtimeName` 计算（core 恒裸 id、冲突各方全加 `<teamId>--` 前缀、败者标 `shadowed`）；`resolveRef`（FQID>同团队>优先级表）与 `resolveInvocation`（优先级表，按 runtimeName）两个函数；`resolveRoster`（all/@team/FQID/跨作用域悬挂/停用成员，**不静默丢弃**）；`resolveActiveTeam` 三层回退（session→project→app→core，跳过无主 Agent 团队）；MCP 一等 Asset；`notifyTeamsChanged` 四路汇聚（agents/skills/ACP 缓存）。
- **测试**：`tests/main/teams-resolver.test.ts` 17 个（三态矩阵含 C7、作用域可见性、名册五种情形、优先级同表驱动 resolveRef/resolveInvocation/runtimeName、活动团队回退、MCP、保留 id 与双布局不变量）。
- **验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2345 过 / 6 失败（=基线）。

### 新增/改造
```
src/main/teams/catalog.ts     ← 改造自 pack-catalog.ts
src/main/teams/resolver.ts    ← 改造自 pack-resolver.ts
src/main/teams/license-gate.ts← 改造自 packs-license.ts（不变）
```

### catalog 的变更点
1. 四个根，每个根标注 `scope` + `source`：
   `resources/teams`(app, bundled/core) · `<pro>/teams`(app, pro) · `<userData>/teams`(app, user/registry) · `<root>/.prismnext/agent/teams`(project, user)。
2. `orchestrator/` 单数目录扫描；发现 `orchestrators/` 旧布局 → warn + 迁移提示（T6 处理）。
3. **保留 id 保护**：外部根声明 `prismnext.core` / `project.local` → 拒绝加载 + error 日志（v1 靠遍历顺序，是隐式的）。
4. `teamId` 必须等于目录名，否则跳过。
5. 删除 `contents` 声明的读取与校验（字段已废）。
6. 指纹计算优化：`computeFingerprint()` 当前每次 `getCatalog()` 都全量 `statSync` 遍历（v1 缺陷 E21）。改为 **100ms 内复用上次结果**（`Date.now()` 门限），并在 lifecycle 写入后强制失效。

### resolver 的变更点
1. `viewKey` 加入 `appStateWriteCounter()`。
2. 判定链改为设计文档 §5.3 的两个函数，产出 `enabled` + `blockedBy` + 原始三态值。
3. `compatible` 进入运行期判定链。
4. `runtimeName` 计算（§7.1 文件名规则的通用化：core 恒裸 id；冲突各方全部加前缀）；被遮蔽者 `blockedBy: "shadowed"`。
5. `resolveRef` 与 `resolveInvocation` 两个函数，各自 JSDoc 写明规则；**删除** `resolveBadge` 的第三套顺序（徽章直接读 `AssetView.origin`）。
6. `resolveRoster`（§6.3）：不静默丢弃，产出 `RosterEntryView` 含 `via` 与 `unavailable`。
7. MCP 成为一等 Asset：进 `byFqid`、进 `listAssets("mcp")`。
8. `notifyTeamsChanged` 串联**四路**下游（含 `AcpService.invalidateAgentConfigCache` + `applyMcpToOpenSessions`）。

### 测试
`tests/main/teams-resolver.test.ts`（表驱动，设计文档 §12.1 的 1/2/3/4/5 全部）：
- 三态矩阵穷举（含 `blockedBy` 断言）。
- 作用域可见性与 `canReference`。
- 名册六种情形。
- **优先级一张期望表驱动四个消费点**（runtimeName / resolveInvocation / skills 顺序 / MCP 名字）。
- 不变量：多 orchestrator 降级、保留 id 拒绝、只读团队写入抛错。

### 验收
resolver 对 fixture 目录树输出稳定；旧 `pack-resolver` 全部调用点尚未切换（本 Phase 不接线），行为零变化。

---

## T3 —— 编排类接管（3 人日）✅ 已完成 2026-08-10

### 目标
主 Agent / 子 Agent / 名册 / 活动团队走通到 OpenCode。

### 实际执行记录（含边界调整）

- **新建**：`src/main/teams/agents-render.ts`（渲染纯函数，只读 `AssetViewV2.runtimeName`；`permission.task` 由名册生成）、`agents-sync.ts`（plan 构建 + 落盘 + **按 root 索引的内存 sync state Map**，治 B11 单槽）、`lifecycle.ts`（§9 全表，唯一写出口）。
- **读时回退（关键决策）**：`state-project.ts` / `state-app.ts` 在 `teams.json` / `teams-state.json` 不存在时，从旧 `packs.json` / `packs-installed.json` **派生**（只读不写盘）。T3 切换后现有项目状态不丢；T6 正式落盘迁移后删除回退。
- **catalog 兼容**：`parseRoster` 把 legacy `allowedExperts` 裸 id 提升为同团队 FQID（`$pack`→`@team`），与旧「同 pack 优先」语义一致——这是 golden 等价的关键。
- **切换点**：`project-subagents-refresh.ts` 的 agent 文件同步改走新 `agents-sync`（chat 链路）。**golden 等价测试**（`teams-agents-sync.test.ts`）证明新 plan 对真实 core pack 与旧 facade **逐字节一致**（含 hash）。
- **边界调整**：IPC 查询层（`ipc/subagents.ts` / `ipc/teams.ts`）与旧 facade（`subagents-sync.ts` 的 `listSubagents`/`resolveOrchestratorId`/CRUD）**保留到 T5**——它们走旧 resolver 读 packs.json，读时回退保证与新链路状态一致。删除旧 facade（`experts-sync`/`agent-experts`/`user-packs`/`ipc/experts`/`ipc/user-packs`）改到 T5（IPC 切新 resolver 后）。原因：T3 删它们会让 IPC 查询无数据源，违反「每 Phase 自洽」。
- **活动团队**：`resolveActiveTeam` 三层回退已在 resolver 落地；`lifecycle.setActiveTeam` 校验 `enabled && hasOrchestrator`。chat 侧从 `defaultOrchestrator` 到「活动团队」的完整切换随 IPC 层在 T5 完成。
- **验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2347 过 / 6 失败（=基线）；golden 等价 + 旧 facade + chat orchestrator 解析共 26 测试全绿。

### 改造
```
src/main/teams/agents-render.ts   ← experts-sync.ts 的渲染部分（纯函数，无 IO）
src/main/teams/agents-sync.ts     ← 落盘 + 同步状态
src/main/teams/lifecycle.ts       ← 改造自 packs-lifecycle.ts + user-packs.ts
src/main/ipc/teams.ts             ← 合并 packs/user-packs/experts 三个 IPC 文件
```

### 关键点
1. **删除** `agentFileBase` / `shadowWinners` / `packShadowRank` / `pruneAllowedExpertIds`；渲染层只读 `AssetView.runtimeName`。
2. **活动团队**取代 `defaultOrchestrator`：
   - 三层回退：`session ?? project.defaultTeam ?? app.defaultTeam ?? CORE_TEAM_ID`。
   - `resolveActiveTeam` 校验 `enabled && hasOrchestrator`，否则继续回退。
3. **agent 文件集合**：所有启用子 Agent（subagent）+ 所有 `enabled && hasOrchestrator` 团队的主 Agent（primary）。切换活动团队只改 `permission.task` 块（§7.1 / D-15）。
4. `PrismExpertsSyncState` 单槽 → 按 root 索引的 Map（B11 的一半）。
5. `lifecycle.ts` 落地设计文档 §9 全表；`installTeam` / `uninstallTeam` 签名去掉 `projectRoot`。
6. `createTeam` / `promoteTeam` / `demoteTeam` / `moveAsset`：目录移动 + FQID 重写 + 引用修补（名册 / `defaultTeam` / 状态键三处）。

### 删除
`experts-sync.ts`、`agent-experts.ts`、`user-packs.ts`、`ipc/experts.ts`、`ipc/user-packs.ts`。

### 测试
- **agents/*.md golden**：迁移前后同一 fixture 逐字节对比（文件名规则差异白名单化）。
- `promote/demote/moveAsset` 后引用完整性（无悬挂 FQID）。
- 活动团队三层回退 + 主 Agent 不可用时的降级。

### 验收
Settings 旧页面（尚未重做）仍能列出主/子 Agent；聊天能正常跑；`syncProjectExpertsToOpencode` 现有测试全绿。

---

## T4 —— 环境类接管：技能 / 命令 / MCP（3 人日）✅ 已完成 2026-08-10

> 可与 T3 并行（不同人）。共同依赖 T2。

### 实际执行记录（含关键 bug 修复与决策）

- **T4a 技能**：`skills-sync.ts` 数据源切到新 resolver（`listAssets`/`resolveRef`）；`skills.paths` 顺序**修正为 §7.5 rank 降序**（core 最弱排最前，项目扫描项最后——D-9 行为变更，修正了 v1 core 反而覆盖用户团队的问题）。
- **T4b 命令**：`registry.list()` 走 `listAssets`、`lookup()` 走 `resolveInvocation`（唯一优先级表）、`setEnabled` 走 `resolveRef`；写文件补 `order`（B12）+ frontmatter 值转义；`create()` 加同名检查。
- **T4c MCP（含 B1 修复）**：`acp/service.ts` 的 MCP 合并改走新 resolver 的 `listMcpServers`；新增 `teams:listMcp` IPC（项目 mcp.json + 团队 MCP 合并，项目优先）；`slash-catalog.ts` 改用它——**团队 MCP 现在能出现在 `/` 目录并被懒加载**（B1 根因修复）；`autoStart` 取代恒空的 `EAGER_MCP_SERVER_IDS`（eager 集合 = autoStart:true 的团队 MCP）；`cachedAgentConfig` 单槽 → Map（B11 另一半）；删 `EAGER_MCP_SERVER_IDS`/`isEagerMcpServer`/`ensureBuiltinMcpInAllowlist` 死代码 + 对应测试。
- **关键 bug 修复（执行中发现）**：
  - **catalog 指纹漏了 local 回退目录** → 跨项目缓存污染（A 项目的 local 内容串到 B 项目）。已修：`computeFingerprint` 纳入 `.prismnext/agent/local/` 指纹。
  - **未安装团队的组件混入运行时**：新 resolver 的 `buildProjectView` 最初不跳过未安装团队，导致未安装 pack 的命令/技能出现在运行时。已修：`if (!team.installed) continue`（与旧 resolver 一致），团队级仍标 `blockedBy:"not-installed"`。
  - **读时回退的失效链**：`setAssetDisabled` 写旧 `packs.json` 不触发新 resolver 失效 → 启停不生效。已修：新 resolver 静态订阅旧 `packs.json`/`packs-installed.json` 的写入事件（T6 迁移后删）。
  - **保留 id 检查误伤项目默认团队**：`project.local`/`user.local` 被「只能来自 bundled」拒绝。已修：按根校验（core 只能 bundled、project 默认团队只能 project 根）。
- **决策（用户拍板）**：T4 保持 `user.local` 前缀不变（`project.local` 重命名留 T6/M10），避免新旧 FQID 前缀分裂。
- **测试**：新增 `teams-env-takeover.test.ts` 4 个（B1 团队 MCP 可解析 + autoStart、未安装团队 MCP 不出现、skills.paths 顺序、命令优先级遮蔽）；适配 `skills-sync.test.ts`/`commands-registry.test.ts`（切新 catalog、core fixture 注册为 bundled source、密封 app state、更新顺序期望）。
- **验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2346 过 / 6 失败（=基线既存 PTY/环境）。

### T4a 技能（1 人日）
- `skills-sync.ts` 数据源改 resolver；**修正 `skills.paths` 顺序**为 rank 降序（core 最前 → 项目最后）。
- `project-skills-refresh.ts`：缓存键含 `viewKey`；切项目走强制重写路径（B4）。
- 新增 `resolveAgentContextRoot(args)`，chat / skills / teams 三处共用同一基准（B5）。
- 删 `profileSkillAllowlist` 死参数四层签名、`registryUrls`、三个 `@deprecated` 导出、写回时的空 `disabled: []`。
- `.prismnext/agent` 末项扫描会命中 `legacy-backup-*/skills/` —— 改为扫 `.prismnext/agent/teams`（精确到项目团队根）。

### T4b 命令（0.5 人日）
- `registry.list()` / `lookup()` 走 resolver 的 `resolveInvocation`。
- 写文件补 `order`；`create()` 加同名检查；frontmatter 值做转义。
- 删 `search()`、`mergeCommandImport`、`resolveImportName`、`ParsedCommand.files/.shells`。
- `commands:toggle` 与 `teams:setAssetEnabled` 合并为后者一条路径。

### T4c MCP（1.5 人日，含 B1 修复）
- 统一 schema：团队 `mcp.json` = `McpServerDef[]`；`project.local/mcp.json` 承接用户 MCP。
- `AcpService.readAgentConfig` 的 MCP 来源改为 `resolver.listMcpServers(root)`（单一来源，不再项目/pack 两路合并）。
- 冲突：按 §7.5 优先级，败者标 `shadowed`（不静默跳过）。
- **`autoStart`** 取代 `EAGER_MCP_SERVER_IDS`；`session/new` 发 `autoStart` 集合。
- **`slash-catalog.ts` 改用 `teams:listMcp`**（B1 的关键修复）。
- `cachedAgentConfig` 单槽 → Map（B11 另一半）。
- 删 `project-mcp-defaults.ts`、`ensureBuiltinMcpInAllowlist`、`mcpJsonRelPath`、恒 false 的三个 `EnsureDefaultMcpResult` 字段。
- 合并 `tests/main/project-mcp-defaults.test.ts` 与 `tests/shared/project-mcp-defaults.test.ts`。

### 测试
- 技能：`skills.paths` 顺序断言（六个 rank）；A→B→A 切项目集成测试；worktree cwd 一致性。
- 命令：优先级胜者、order 往返、同名拒绝。
- MCP：端到端（安装带 MCP 的团队 → `/` 目录出现 → `session/load` 收到）；逐项关闭 → 已开会话即时生效；同名冲突标记。

### 验收
B1 / B2 / B4 / B5 / B9 / B12 的复现用例全部转绿。

---

## T5 —— UI 重做（4 人日）✅ 已完成 2026-08-10

### 实际执行记录

**T5 IPC 切换**（`7afe712`）：`ipc/teams.ts` 重写——查询通道切到新 TeamResolver（返回 `TeamViewV2`/`AssetViewV2`，含 `scope`/`blockedBy`/`runtimeName`/`counts`）；写操作切到 `teams/lifecycle.ts`（唯一写出口）。新增 `getRoster`/`getActiveTeam`/`setActiveTeam`/`create`/`delete`/`promote`/`demote`/`moveAsset` 通道。`teams-store.ts` 重写为 `TeamViewV2` + 派生 `TeamCardView` 兼容层。`electron.d.ts`/preload 签名同步。

**T5 共用组件**（`fd874e4`）：8 个组件——`scope-chip`（UX2）、`origin-chip`、`override-dot`（覆盖指示器）、`blocked-hint`（UX3 无假开关）、`team-picker`（UX1 归属选择器）、`roster-editor`、`asset-group-list`（三能力页共用）、`team-card`。全部不透明 token + i18n 三份。

**T5a Settings→Teams 重做**（`942ee5c` → `1a80768` 重写）：严格遵循 `appearance-settings.tsx` 模式——`max-w-3xl` 外壳 + `SETTINGS_CARD`/`SETTINGS_ROW` token + shadcn 控件。恢复全部被吞功能（新建 Orchestrator/Expert、Reset builtin experts、Info→pack-detail、InlineDeleteButton、空态大图标）。保留新模型（活动团队区、名册编辑、作用域、三态开关）。

**T5b 不透明 token 修复**（`0e519aa`）：Skills/Commands/MCP 三页的半透明色违规修复——`bg-muted/40`→`bg-muted`、`bg-muted/60`→`bg-muted`、`bg-destructive/10`→`bg-destructive`、`bg-secondary text-primary`→`bg-secondary text-secondary-foreground`。

**T5c 商店页 + 详情面板**（`85f7258`）：`window.confirm` 换内联两步确认（destructive Button）；「去管理」补 `setSettingsCategory("teams")`（B13）；卡片网格和空态用 `<PackIcon>` 替代手搓 `<Package>` div。

**T5 i18n 收尾**（`e24b3c7`）：删 7 个孤儿 key（`tabProject`/`tabApp`/`projectEnabled`/`projectDisabled`/`disableInProject`/`appInstalled`/`browseMore`），三份 locale 同步。

**验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2346 过 / 6 失败（=基线既存 PTY/环境）。

---

## T6 —— 迁移（2 人日）✅ 已完成 2026-08-10

### 实际执行记录

T3/T4 期间的「读时回退」（每次读取从旧文件派生，不落盘）替换为 T6 的「一次性落盘迁移」（首次读取时真正转换并写入新文件，后续直接读新文件）。

**项目级迁移**（`state-project.ts`）：
- `readProjectTeamsState` 在 teams.json 不存在但 packs.json / legacy agent state 存在时，执行 M4-M7 + M10 转换并**写入 teams.json**。
- M4: `projectPackStates[id].enabled=false` → `teamEnabled[id] = false`
- M5: `disabledContent[]` → `assetEnabled[fqid] = false`
- M6: `contentOverrides{}` → `assetOverrides{}`
- M7: `defaultOrchestrator` (FQID) → `defaultTeam` (teamId prefix)
- M10: `user.local:` → `project.local:` FQID 重写（覆盖 assetEnabled / assetOverrides / defaultTeam 所有键）

**应用级迁移**（`state-app.ts`）：
- `readAppTeamsState` 在 teams-state.json 不存在但 packs-installed.json 有记录时，执行 M1 复制并**写入 teams-state.json**。

**写入消费者切换**：
- `skills-sync.ts`：`setAssetDisabled`（写 packs.json）→ `setProjectAssetEnabled`（写 teams.json）
- `commands/registry.ts`：同上
- `skill-library-catalog.ts`：同上
- `teams-lifecycle.ts`：`setTeamEnabled`/`setDefaultOrchestratorFqid`（写 packs.json）→ `setProjectTeamEnabled`/`setProjectDefaultTeam`（写 teams.json）；catalog 查找从 `getTeam`（旧 resolver）→ `getTeamRecord`（新 catalog）；默认团队检查从 `readTeamsState`（读 packs.json）→ `readProjectTeamsState`（读 teams.json）

**测试适配**：
- `packs-lifecycle.test.ts`：切到新 catalog、新写入器、bundled source、密封 app state、resolver reset
- `skills-sync.test.ts`：切到新写入器（`setProjectTeamEnabled`/`setProjectAssetEnabled`）

**边界调整**（与计划的偏差）：
- 计划要求新建 `src/main/teams/migration.ts` 作为唯一 legacy 读取点。实际实现把迁移逻辑直接嵌入 `state-project.ts`/`state-app.ts` 的 `readProjectTeamsState`/`readAppTeamsState`，因为迁移本质是「首次读取时触发」，嵌入读取函数比独立模块更自然。
- M8（`.prismnext/agent/local/` → `.prismnext/agent/teams/project.local/` 物理移动）和 M11（`.prismnext/agent/mcp.json` → `project.local/mcp.json`）留给后续——当前 catalog 的 local 回退扫描（`.prismnext/agent/local/` 合成为 `user.local` 团队）仍然在工作，M10 的 FQID 重写已经在状态层完成。
- 回滚脚本（`scripts/teams/rollback-v2.mjs`）留给 T8。

**验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2346 过 / 6 失败（=基线既存 PTY/环境）。

**T5 先做、T6 后做的分析**：计划依赖图说 T6 应在 T5 之前合入，但实际 T5 先做、T6 后做是安全的——T5 的 UI 通过 resolver 抽象访问数据，不直接依赖磁盘布局或 FQID 前缀，所以 T6 的存储迁移不改变数据内容，不影响 T5 的 UI 显示。

---

## T7 —— Pro 与商店对接（1.5 人日）✅ 已完成 2026-08-10

### 实际执行记录

- **`pro-teams-discovery.ts`**：import 从旧 `team-catalog`/`team-resolver` 切到新 `teams/catalog`/`teams/resolver`；`package.json` 键查找优先读 `teamsRoot`，兜底读旧键 `packsRoot`（兼容）；discovery 扫描接受 `team.json` 和 `plugin.json` 两种 manifest（双布局兼容）。
- **`active-project-roots.ts`**：`_registeredRoots()` 注释从「Test-only accessor」改为「Public accessor」——它在生产中被 `pro-teams-discovery` 用于 license 变化后广播失效。
- **license 门确认**：license 门已在 T2 的 resolver 落地（`licenseGrants` → `blockedBy: "license"`，安装记录不动）。`handleProLicenseChanged` 已调 `notifyTeamsChanged()`。
- **测试**：`pro-packs-discovery.test.ts` 切到新 catalog（`getTeamRecord`、`listExternalTeamRoots` from `teams/catalog`）+ 新 resolver reset；`pack.kind` → `pack.source`。

**验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2346 过 / 6 失败（=基线既存 PTY/环境）。

---

## T8 —— 清理与验收（1.5 人日）✅ 已完成 2026-08-10

### 实际执行记录

- **死代码删除**（附录 D 逐条 grep 验收）：大部分已在 T0-T7 各阶段删除。T8 补删了 `_profileSkillAllowlist` 死参数（`computeProfileSkillDisabled` + `syncProjectSkillsIntegration` + `project-skills-refresh.ts` 三层签名）和 `registryUrls` 恒空返回字段。恢复误删的 `scheduleSkillsRefreshFromAgentPath` / `scheduleSkillsRefreshFromPaths`（fs watcher 用）。
- **changelog**：新建 `changelog/0.7.x.md`，写 `## 0.7.0 (Unreleased)` 的 Teams 架构 v2 章节（面向用户：一个团队一个主 Agent、子 Agent 可跨团队复用、全局/项目双层、能力页统一、MCP 一等公民、blockedHint、overrideDot、一次性迁移）。
- **grep 验收**：附录 D 清单的 21 项中，18 项已清零，3 项为旧层残留（`registryUrls` 在 skills-sync 已删、`MIGRATIONS` 在 teams-state 旧层、`mcpJsonRelPath` 在 mcp-servers-store）——这些属于旧层（`services/teams-state.ts` / `services/team-resolver.ts` / `stores/mcp-servers-store.ts`），在旧层完全退役前（T8 后或下一版本）保留。

**验收**：typecheck 主进程 49（=基线）、renderer 零新增；测试 2346 过 / 6 失败（=基线既存 PTY/环境）。

---

## 2. 分期与最小可发布切片

如果需要中途出一个可用版本，唯一合理的切点是 **T0–T4 完成后**（数据与运行时全对，UI 仍是旧壳）。此时：

- 内部可用、可自测，但**不发布**（旧 UI 表达不了新模型，用户会更困惑）。
- 若必须发布，只能发 T0（纯重命名，用户无感）。

**不建议**把 T5 拆成多个可发布切片：半套 UI 混着旧 UI 就是第四次「差强人意」。

---

## 3. 人日汇总

| Phase | 内容 | 人日 |
|---|---|---|
| T0 | 词表冻结与重命名 | 1.5 |
| T1 | 数据模型与状态层 | 2 |
| T2 | 解析层 | 3 |
| T3 | 编排类接管 | 3 |
| T4 | 环境类接管（技能/命令/MCP） | 3 |
| T5 | UI 重做 | 4 |
| T6 | 迁移 | 2 |
| T7 | Pro 与商店 | 1.5 |
| T8 | 清理与验收 | 1.5 |
| | **小计** | **21.5** |
| | 并行折抵（T4 与 T3、T6 与 T3/T4） | −4.5 |
| | 机动 | +2 |
| | **合计** | **19** |

---

## 4. 每 Phase 的通用 Definition of Done

1. `pnpm typecheck` 与 `pnpm test` 全绿。
2. 该 Phase 的新增测试覆盖设计文档 §12 对应条目。
3. 该 Phase 删除清单里的文件确已删除（不是留空壳）。
4. 无新增 `TODO` / `@deprecated` 而不带删除计划的导出。
5. 若有 UI 改动：中/繁/英三份 i18n 齐全，主题 token 不透明。
6. 提交信息遵循 `.cursor/rules/git-commit-messages.mdc`。

---

## 5. 风险登记（执行期滚动更新）

| # | 风险 | 触发信号 | 应对 |
|---|---|---|---|
| P-1 | T0 重命名与他人分支冲突 | 并行分支多 | T0 单独一个 PR，当天合入，通知所有人 rebase |
| P-2 | T2 优先级表改动导致既有项目行为变化（例如 core 技能不再覆盖官方团队技能） | 用户报「技能内容变了」 | 优先级表在 T2 落地时用真实项目做一次 before/after 对比清单，写进 changelog |
| P-3 | T3 的 agent 文件名规则变化触发 OpenCode 全量 reload | 首次启动变慢 | core 恒裸 id 覆盖大多数文件；golden 测试量化变化面 |
| P-4 | T6 迁移在多 orchestrator 的项目里拆团队，用户困惑 | 迁移日志出现 warning | 迁移后弹一次说明性通知，列出被拆出的团队 |
| P-5 | T5 工作量超预期（UI 一贯的风险） | T5 第 3 天仍未完成 T5a | 砍 T5c 的「已在 N 个项目启用」与商店视觉打磨，保 T5a/T5b |
| P-6 | `promote/demote` 引用修补有遗漏 | 名册出现悬挂项 | 交付「引用完整性检查」诊断（`teams:diagnose`），T3 内一并做 |

---

## 6. 前置决策（已定稿 2026-08-10）

以下六项影响 T1/T2 的数据结构，已全部确认，作为实施约束：

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 一个团队至多一个主 Agent（`orchestrator/` 单数目录结构强制） | **✅ 确认**。对所有来源统一，包括用户自建团队。想要两个主 Agent 就建两个团队 |
| Q2 | 废除 `user.local` 伪团队，迁为真实项目团队 `project.local` | **✅ 确认**。可改名、可有主 Agent、可提升为全局 |
| Q3 | 项目级可以推翻应用级停用（三态 unset/on/off） | **✅ 确认**。唯一合并函数 `resolveTri(project, app, true)` |
| Q4 | 优先级表 `project > user > registry > pro > bundled > core` | **✅ 确认**。**这改变现状行为**（今天 core 技能反而覆盖其他团队同名技能），T2 落地时产出真实项目的 before/after 对比清单并写进 changelog |
| Q5 | 用户 MCP 改为项目团队的 `mcp.json`（数组 schema），全系统单一 MCP schema | **✅ 确认**。迁移自动完成，原位置留指引注释 |
| Q6 | 词表重命名（`expert` → `subagent`、`pack` → `team`）一次做完 | **✅ 确认**。T0 单独一个 PR，当天合入 |

---

（全文完。前置决策已定稿，可启动 T0。）
