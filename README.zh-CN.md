<p align="center">
  <img src="./assets/readme-cover-zh.png" alt="PrismNext —— 预印本风格封面" width="100%" />
</p>

<p align="center">
  <strong>全方位的 AI Agent 科研协作应用 —— 科研增强型嵌入式 Pi Agent 与 Teams v2，坐镇本地优先的书桌。</strong><br />
  脑暴 · 文献 · 实验 · 批判 · 写作 —— 既可全自主闭环，也可并肩协作。
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/yibocat/prismnext/releases"><img src="https://img.shields.io/github/v/release/yibocat/prismnext?include_prereleases&label=下载" alt="下载" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0" /></a>
  <img src="https://img.shields.io/badge/status-Early%20Access-orange" alt="Early Access" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="平台" />
  <img src="https://img.shields.io/badge/local--first-BYOK-success" alt="本地优先" />
  <img src="https://img.shields.io/badge/agent-Pi%20%2B%20Teams%20v2-blueviolet" alt="Agent: Pi + Teams v2" />
</p>

<p align="center">
  <a href="https://prismnext.pages.dev/">官网</a> · <a href="https://prismnext.pages.dev/changelog.html">更新日志</a> · <a href="https://github.com/yibocat/prismnext/releases">发布版本</a>
</p>

---

## PrismNext 是什么

PrismNext 是一套 **全方位的 AI Agent 科研协作应用** —— 既不是「加了聊天侧栏的 LaTeX 编辑器」，也不是「隔夜自动跑完的 AI 科学家」。

方向由你定；嵌入式 **Pi Agent** 与 **Teams v2** 以你选择的自主程度完成剩下的事：既可以自主跑通完整科研闭环——读文献、思考、批判、做实验、写作、审阅——也可以作为科研副驾与你并肩推进。无论哪种方式，每一步都有闸门、可观察、本地优先。

**它与众不同之处：**

- **Teams v2 —— 切换团队，即切换工作模式。** Team 不是一段提示词模板：它为书桌配置一位 Lead 发声、Task 委派的专科 Subagent、技能、斜杠命令与 MCP 工具。Core 内置 8 支团队与 30 项科研技能；Pro 追加论辩场、模拟答辩与学术生涯教练。
- **一张书桌装下整个闭环。** 文献、Brief、Plan、实验、笔记、Git 与手稿都是应用内的一等公民——而不是散落在阅读器、终端和编辑器里。
- **自主，但有缰绳。** 交互式 Plan（⌥P）、权限模式、Allow / Deny 卡片与实时 Job Monitor：可以完全放手，也可以始终握着方向盘。
- **可引用的溯源。** 每次实验运行都把命令、退出码、时长与产物固化为 `runs.jsonl` 收据——Methods 里的每个结论都能回溯到真实运行。
- **本地优先，BYOK，零遥测。** 你的机器、你的密钥、你的数据。SSH 远程 Host 同样是密封密钥（AES-256-GCM，解钥永不离开这台电脑）。

<p align="center">
  <img src="./assets/research-loop-zh.svg" alt="PrismNext 科研闭环" width="640" />
</p>

---

## 核心亮点

### Teams v2 —— 切换团队，即切换工作模式
Team 不是一段提示词模板。它为书桌配齐人马：一位 **Lead** 在 Chat 中发声，专科 Subagent 经 Task 以子会话到场，每支团队还自带技能、斜杠命令与 MCP 工具。Core 内置 8 支团队（科研、写作、图表、评审、数学……），各自重塑 Agent 规划、批判与写作的方式；Pro 再追加论辩场、模拟答辩与学术生涯教练。切换活跃团队即刻换班——同一个输入框，另一种工作方式。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/team-dark.png" />
    <img src="./assets/shots3/team-light.png" alt="团队设置——查看主 Agent、Subagent 与技能" width="92%" />
  </picture>
</p>

### 多项目 Workbench
多个论文文件夹同时驻留——各自拥有聊天、文件树、文献库与模式面板。切换焦点不打断后台 Agent；等待批准的聊天会在标题栏亮起芯片，随时跳回。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/chat-dark.png" />
    <img src="./assets/shots3/chat-light.png" alt="与团队对话——Agent 调动整张书桌" width="92%" />
  </picture>
</p>

### 文献，是被真正阅读的
按项目隔离的 SQLite 文献库，Zotero 双向同步，Crossref / arXiv / OpenAlex / Semantic Scholar 作为 Agent 工具直接检索，可选 MinerU 解析，持续的引用健康审计（`.tex` / `.typ` ↔ `.bib` ↔ 文献库）。对话中检索到的论文进入侧栏，一键即可入库。Office 文档、EPUB、CSV 经 AnyDoc 本地转换——无需 API Key。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/discover-dark.png" />
    <img src="./assets/shots3/discover-light.png" alt="对话中检索到的论文，一键入库" width="92%" />
  </picture>
</p>

### 论文伴读
论文与副驾并排而立：针对引理、结论或图表提问，回答自动标注页码引用。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/reading2-dark.png" />
    <img src="./assets/shots3/reading2-light.png" alt="论文与伴读副驾并排而立" width="92%" />
  </picture>
</p>

### 带溯源的实验
Research Brief 与 Plan 在投入算力前沉淀意图；实验运行经权限模式闸门、实时监视，并把回执写入 `runs.jsonl`。关闭标签页，长时实验继续跑。

### LaTeX 与 Typst，实时所见
预览是实时的——Typst 随打随渲染，LaTeX 后台编译出 PDF。自己写或让 Agent 起草，每处修改都以可审阅的 **Proposed Changes** 差异呈现；论文内 Composer 更能让 Agent 直接在你阅读的位置修改手稿。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/writing-dark.png" />
    <img src="./assets/shots3/writing-light.png" alt="实时预览——Typst 或 LaTeX 写作" width="92%" />
  </picture>
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/composer-dark.png" />
    <img src="./assets/shots3/composer-light.png" alt="论文内 Composer——Agent 直接修改手稿" width="92%" />
  </picture>
</p>

### 技能，尽收眼底
在一个地方浏览所有内置技能——协议、模板与可执行检查。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/shots3/skills-dark.png" />
    <img src="./assets/shots3/skills-light.png" alt="所有技能一览" width="92%" />
  </picture>
</p>

### SSH 远程科研
从 `~/.ssh/config` 打开实验室机器。Host 运行时自动装机；聊天、文件、文献、编译与实验都在服务器上执行，笔记本只是控制台。远程会话在本机保留离线副本，冷启动即可浏览。

---

## 为什么选择 PrismNext

| 维度 | 通用编程 Agent | 文献问答 / 全自动 AI 科学家 | **PrismNext** |
| :--- | :--- | :--- | :--- |
| **科研闭环** | 割裂于 IDE、终端与聊天窗口 | 隔夜自动运行、结果未经检验 | **一条连续闭环——构思 → 阅读 → 思考 → 运行 → 写作 → 审阅，自主程度由你选择** |
| **智能体范式** | 单一通用聊天框 | 固定提示词模板 | **Teams v2：Lead + Task 委派专科 + 技能 + MCP，一次切换即整队换班** |
| **文献调研** | 无视文献库 | 仅「和 PDF 聊天」 | **细粒度调研：按项目文献库、Zotero 同步、框选公式的精读模式、`.tex`/`.typ` ↔ `.bib` 引用健康审计** |
| **推理能力** | 自由聊天 | 幻觉频出的长文 | **符号数学（SymPy 验证）、推导逐步核查、对照证据的批判性审阅** |
| **实验执行** | 不可控的临时子 Shell | 黑盒云端虚拟机 | **带闸门的运行、实时 Job Monitor、可写入 Methods 的 `runs.jsonl` 收据** |
| **远程协作** | 顶多算 dev container | 全托管黑盒 | **SSH 无感部署：Host 自动装机，笔记本只是控制台，密钥全程密封** |
| **科研实体** | 纯文本缓冲区 | 聊天附件 | **文献库、Brief、Plan、运行、笔记、手稿——全部真实落盘** |
| **学术写作** | Markdown 或暴力覆写 | 未经验证的生成文本 | **LaTeX 与 Typst 双一等公民、实时预览、Proposed Changes 差异** |
| **流程治理** | 泛化的权限弹框 | 几乎没有 | **Plan、权限模式、Allow/Deny 卡片、人类终审否决** |
| **数据隐私** | 强依赖云端 / SaaS | 远端托管服务器 | **本地优先、BYOK、零遥测** |

---

## 30 项内置科研技能

默认 **Core** 团队内置 30 项固化的科研技能——协议表、LaTeX/Typst 模板与可执行检查：

| 领域 | 技能 |
| :--- | :--- |
| **构思与设计** | `idea-lab` · `hypothesis-design` · `experiment-design-matrix` · `ml-research-protocol` · `statistical-rigor` · `management-science-empirical` · `experiment-to-methods` |
| **写作** | `writing-design` · `writing-introduction` · `writing-preliminaries` · `writing-methods` · `writing-results` · `writing-conclusion` · `writing-related-work` |
| **图表** | `figure-matplotlib` · `figure-observable-plot` · `figure-tikz` · `figure-typst` · `figure-pipeline` · `figure-interaction` |
| **阅读与评审** | `intensive-reading-notes` · `prisma-systematic-review` · `critical-review` · `manuscript-preflight` · `rebuttal-letter` |
| **数学与元能力** | `symbolic-math` · `math-numeric` · `math-manifold` · `math-lattice` · `skill-creator` |

---

## Pro 专科团队（Early Access）

Core 之外，官方 beta 还捆绑 8 支可选 Pro 团队，覆盖科研关键攻坚节点：**Idea Arena**（结构化论辩）· **The Committee**（模拟答辩）· **Rebuttal War Room** · **Milestone Coach**（学术生涯时间线）· **Claim Police**（主张—证据审计）· **Translation Table**（跨学科对照）· **Topic Brainstorm** · **Idea Ledger**。

> **激活**：在含 Pro 的构建中打开 **设置 → 关于**，粘贴 **`PRISM-PRO-DEV-TEST`** 并点击 **激活**——抢先体验期间免费。

---

## 不可妥协的底线

1. **本地性** —— 手稿留在 Git 树；应用状态在 `~/.prismnext/`，项目元数据在 `<project>/.workbench/`。不上传至 PrismNext 云端。
2. **BYOK** —— 模型调用从你的机器直连供应商。无代理，无 Prism 云。
3. **显式的第三方请求** —— 文献元数据检索与可选 MinerU 处理，仅在用户发起该动作时发生。
4. **零遥测** —— 无追踪、无行为分析。详见[隐私政策](https://prismnext.pages.dev/privacy.html)。
5. **人类终审否决** —— Plan、权限模式与差异视图，让研究人员始终保持绝对控制。

---

## 快速上手

1. **安装** —— 从[发布版本](https://github.com/yibocat/prismnext/releases)或[官网](https://prismnext.pages.dev/)获取 `.dmg` / `.exe` / `.AppImage`。
   > macOS Gatekeeper：若提示应用损坏，执行 `xattr -cr /Applications/PrismNext.app`。
2. **配置密钥** —— 设置 → 模型，选择供应商，填入 API Key。
3. **打开项目** —— Workbench **+** 打开已有文件夹，或从模板（Paper / Research Lab / Minimal）新建。`.tex` 留在仓库根目录；元数据进入 `.workbench/`。
4. **选择团队，开始对话** —— 切换活跃团队即切换 Agent 的工作方式。随时经 Host → SSH 连接实验室机器。

Agent 说明位于 `.workbench/agent/AGENTS.md`（设置 → Prompts & Rules）。创建或编辑技能后，请 **新开聊天 Tab**，会话才会加载最新技能。

---

## 贡献与开源许可

欢迎为开源 Host、科研技能与编译集成贡献代码！
- 本地开发：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 许可：[Apache License 2.0](./LICENSE) · Copyright © 2026 yibocat —— 详见 [NOTICE](./NOTICE)

---

<p align="center">
  <strong>PrismNext</strong> —— 完整的科研闭环，在你的书桌上，在你的闸门之内。
</p>
