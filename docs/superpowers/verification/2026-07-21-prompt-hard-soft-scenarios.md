# 科研场景验证清单 — Prompt Hard/Soft（P0–P3）

**目的：** 用假设科研对话验证「软判断 / 工具说明书 / HARD 护栏」是否各就各位。  
**配套自动化：** `tests/main/prompt-hard-soft-scenarios.test.ts`（契约层，不启 Electron）。  
**手工：** 重启 App → **新开聊天** → 按场景点验。

---

## 场景矩阵（摘要）


| ID  | 用户意图（假设）                        | 期望软行为                                          | 期望 HARD / UI                        |
| --- | ------------------------------- | ---------------------------------------------- | ----------------------------------- |
| S1  | 设计 Bubble vs Quick 对比实验与可证伪假设   | **AI 判定**后可能 call `suggest-plan`（无 App 关键词拦发送） | 同意后进 Plan；只能写 `drafts/<sid>.md`     |
| S2  | 接受 Enter Plan 后要正式计划            | 同轮 tool result 带 `draftPath` + 结构 hints        | 写草稿后出现 Approve；聊天长文不算 plan          |
| S3  | Approve & Build                 | 执行 turn 要求 todowrite                           | UI 立即种出 Task Plan                   |
| S4  | 「最近 RL 论文」要推荐几篇                 | module 只提示去 stage；细则在 tool                     | 未 stage 不应当正式 `[n]`（靠 tool BINDING） |
| S5  | 精读库内某篇 PDF 方法部分                 | `literature-intensive-reading` → `read-pdf`    | 未 intensive 则 read-pdf 失败           |
| S6  | 直接 `edit` brief.md              | —                                              | **deny** + 下轮提示用 brief tools        |
| S7  | 「编译一下 main.tex」                 | AI **通常**不应 call `suggest-plan`（软）             | 正常 compile；App **绝不**关键词弹条          |
| S8  | Plan 里写到自造 `drafts/foo-plan.md` | —                                              | **deny**，引导 canonical 路径            |
| S9  | 跑实验 / 装依赖（module 侧）             | 只点到 `experiment-run`                           | module **不**复述 uv/venv HARD 长文      |


---



## 手工脚本（建议 20–30 分钟）



### 准备

1. 打开有文献库 +（可选）Experiment 文件夹的项目
2. 完全重启 prismnext
3. 每个场景用**新聊天 tab**（Build 起步）



### S1 — 实验设计（主动 Plan）

**你说：**  
「我想做 Bubble Sort 和 Quick Sort 在不同分布下的适用边界实验，先帮我把可证伪假设和因素矩阵想清楚。」

**期望（软判断在 Agent — 科研多阶段，不是「大改代码才 Plan」）：**  
发送后 AI **先跑**（可有 thought）。若判断这是多步骤/多阶段科研工作（假设、因素矩阵、实验设计等），应 call `suggest-plan` → 15s 同意条。  
App **不得**关键词硬弹条。仍不 call = 软提示/模型观测问题，不是 HARD 失败。

**看：**  

- [x] AI 先启动（非秒弹条）  
- [x] 若出现建议条：来自工具 `suggest-plan`；未点前仍是 Build  
- [x] 点进入后出现 Plan chip



### S2 — 写草稿文件

**继续（已在 Plan）：** 「按推荐路径写完整实验计划。」

**看：**  

- [x] 有对 `drafts/<sessionId>.md` 的 write/edit  
- [x] 出现 Approve & Build（非仅聊天长文）  
- [x] 若只聊不写：toast / 自动再踢一轮写草稿  



### S3 — Approve

**点：** Approve & Build  

**看：**  

- [x] 立刻出现 Task Plan（todowrite UI）  
- [x] 切到 Build，开始按计划执行  



### S4 — 外部文献

**新聊天，说：** 「推荐 3 篇 2023 以后和 diffusion policy 相关的论文，并说明贡献。」

**看：**  

- [x] 有 Paper Search MCP 和/或 `literature-stage`  
- [x] 回复用 `[n]`，不是未 stage 的裸列表冒充引用  



### S5 — 精读

**新聊天，@ 库内一篇（或不 @）：** 「这篇方法部分怎么做 ablation 的？请读 PDF 正文。」

**看：**  

- [ ] 出现 `literature-intensive-reading`（add）再 `literature-read-pdf`  
- [ ] 未 add 时 read-pdf 报 intensive 相关错误  



### S6 — brief 硬门

**Build 下让模型：** 「用 edit 工具直接改 `.prismnext/research/brief.md` 的 Research question。」

**看：**  

- [ ] edit/write 被拒  
- [ ] 应改用 `research-brief-update`  



### S7 — 不应进 Plan

**说：** 「编译一下 main.tex」

**看：**  

- [ ] **没有** 发送瞬间的关键词弹条（App 侧已移除）  
- [ ] 通常也不应出现 `suggest-plan`；走 compile  



### S8 — Plan 错路径（可选）

Plan 模式下若模型写到奇怪 drafts 名：应被拒并提示正确路径。

---



## 自动化覆盖范围

契约测试覆盖：模块注册、tool 含 BINDING、brief/plan 路径 deny、已删除用户句启发式、appendix 路径-only、experiments 不复述 HARD。  
**不覆盖：** 真模型是否 call `suggest-plan`（需手工或日后 e2e）。

```bash
cd prism-next && pnpm exec vitest run tests/main/prompt-hard-soft-scenarios.test.ts
```

