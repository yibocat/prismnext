# PrismNext

<p align="center">
  <img src="./assets/app-icon.png" alt="PrismNext" width="96" height="96" />
</p>

<p align="center">
  <strong>桌面上的协作式 AI 科学家。</strong><br />
  文献 · 研究设计 · 实验 · LaTeX — 本地一体工作台。
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License: Apache 2.0" /></a>
  <a href="https://github.com/yibocat/prismnext/releases"><img src="https://img.shields.io/github/v/release/yibocat/prismnext?include_prereleases&label=release" alt="GitHub release" /></a>
  <img src="https://img.shields.io/badge/status-Early%20Access-orange" alt="Early Access" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform: macOS, Windows, and Linux" />
  <img src="https://img.shields.io/badge/local--first-BYOK-success" alt="Local-first, bring your own API key" />
  <img src="https://img.shields.io/badge/LaTeX-first--class-informational" alt="LaTeX first-class" />
</p>

> **定位说明。** 科研闭环已经可用。我们**不**宣称这是无人值守的「自动发论文」产品。PrismNext 面向的是**严肃共驾**：Agent 可以推进工作，**闸门始终在你手里**。

---

## 它是什么

PrismNext 是面向学术写作与研究实践的 **本地优先** 桌面工作台。它不是「聊天框 + 改文件」的通用编程 Agent，也不是承诺隔夜交稿的黑箱流水线。

它把 **读文献 → 想清楚 → 跑实验 → 写成稿 → 审一遍** 放进同一个应用，文献库、Brief、Plan、实验记录、TeX 源稿等科研对象都落在 **你自己的磁盘** 上。

---

## 适合谁

- **科研人员**（博士、硕士及更广范围）——论文、实验、引用是日常工作
- **小团队共写**——共用仓库、Git / worktree，AI 辅助但可控
- **认真写 LaTeX 的人**——需要 SyncTeX、编译、diff，而不是纯 Markdown 凑合
- **在意数据主权的人**——手稿与文献库留在本机，模型 API Key 自行配置

若只想「随口问两句文献」，它可能偏重；  
若希望 **天天开着干活**，这才是设计目标。

---

## 为什么是 PrismNext

| | 通用编程 Agent | 文献问答 / 「全自动 AI Scientist」 | **PrismNext** |
| --- | --- | --- | --- |
| 重心 | 文件 + 对话 + 工具 | 检索或隔夜流水线 | **科研对象全生命周期** |
| 控制 | 很少学术闸门 | 手稿 / 诚信控制偏弱 | **Plan 同意、批准再构建、权限模式** |
| 数据 | 偏云端 / 通用 IDE | 多为 SaaS | **本地优先 + 你的 API Key** |
| 产出 | 「帮我改 `.tex`」 | 「找论文 / 生成论断」 | **读 → 设计 → 实验 → 写 → 引用 → 编译** |

原则：**Agent 往前推，你始终能踩刹车。**

<p align="center">
  <img src="./assets/research-loop-zh.svg" alt="PrismNext 科研闭环" width="640" />
</p>

---

## 功能概览

### 文献

- 项目级 **文献库**（SQLite）与 PDF 精读——不是飘在对话里的临时附件
- 元数据 enrich（Crossref、arXiv、OpenAlex 等）
- BibTeX 导入导出、引用暂存与 citation health
- 检索后可 **stage 进本地库**，书架随项目增长

### 研究设计

- **Research Brief**——跟着项目走的设计笔记
- **Plan 工作流**——Build | Plan；进入 Plan 前需同意（`⌥P` / `Alt+P` 可切换）
- 草稿 → **Approve & Build** → Checklist，减少「聊着聊着就改飞了」

### 实验

- 实验工作区、run 日志、产物快照
- **Provenance**：结果 / 图从哪次命令来，写 Methods 时有据可查

### LaTeX 写作

- TeX 工作区（大纲、查找、语言支持）
- **pdf.js 预览 + SyncTeX** 双向跳转
- Tectonic（默认）或 TeXLive；`% !TEX program` / `% !TEX root`
- **Proposed Changes**：Merge 视图审改，逐条或批量接受 / 拒绝
- 导出 PDF 或源码 zip

### Agent 共驾

- 多标签对话、流式输出
- 编排器 + 专家（文献 / 设计 / 方法 / 结构 / 同行评审等）
- Skills · 斜杠命令 · Knowledge Modules · 项目 Rules
- 权限模式：询问 / 编辑自动 / 全自动 / 只读

| 模式 | 角色 |
| --- | --- |
| **你主导** | 自己写、自己编译，偶尔问 Agent |
| **共驾** | Agent 推进设计 / 实验 / 写作，重要节点你批准 |
| **AI 主导** | 工作面最大化监测，胶囊栏轻干预 |

### 日常工程壳

- Git：状态、暂存、diff、提交、分支、merge、stash
- Worktree：并行写作上下文
- 终端 + AI bash
- 应用内浏览器
- 模板：论文 / 学位论文 / Beamer / 海报 / CV / 信函
- 界面语言：English · 简体中文 · 繁體中文（香港）
- 打包版支持 **应用内更新**

---

## 开始使用

### 1. 安装

从 [GitHub Releases](https://github.com/yibocat/prismnext/releases)（或托管后的 [下载页](./website/)）获取 **macOS** / **Windows** / **Linux**（AppImage）安装包。

> macOS 若提示「已损坏」，多为未签名隔离，对 `.app` 执行一次后再开：
>
> ```bash
> xattr -cr /path/to/PrismNext.app
> ```

### 2. 打开或新建项目

选文件夹作为项目根目录。PrismNext 会在其中维护 `.prismnext/`（文献库、brief、实验、编译缓存等）——**都在本机**。

### 3. 接入模型

**设置**（`⌘,` / `Ctrl+,`）→ 填写供应商与 API Key（**自备密钥**）。  
没有「把毕业论文上传到 Prism 云」这一步。

### 4. 进入闭环

1. 将论文加入文献库，或检索后入库  
2. 在 Brief / Plan 中写清问题与路径  
3. 在 TeX 中写作，对照 PDF 预览  
4. 需要时挂上实验 run 与产物  
5. 卡住时再对话；大改动走 Plan / 权限闸门  
6. 审阅 Proposed Changes，只保留你真正想要的修改  

---

## 「本地优先」指什么

- 手稿、文献库、实验记录、Agent 配置 → **本机**
- 模型调用 → **你的 Key**
- 可选联网（enrich、检索 MCP 等）→ **显式触发**，不是默默同步整个项目

适合未发表数据、敏感稿件，以及「不想把整个课题交给某个 SaaS」的场景。

---

## 界面预览

品牌与闭环示意图见 [`assets/`](./assets/)。下载站所用产品截图见 [`website/assets/`](./website/assets/)。

> 欢迎贡献更多真实界面截图（欢迎页、TeX+PDF、文献库、Plan 同意条等）。

---

## 路线图（Early Access）

我们在把 **共驾** 做深：

- 更稳妥、可审计的主题发现 → 本地库
- 更清晰的证据 / 立场快照（不是「科学共识已判定」）
- 更鲜明的 Human / AI / Co 驱动模式

**现阶段不做：** 默认隔夜无人发现、自动投稿、或假装取代科学家本人。

---

## 参与与许可

欢迎 Issue / PR：科研闭环、闸门体验、本地优先工程均可。详见 [CONTRIBUTING.md](./CONTRIBUTING.md)、[SUPPORT.md](./SUPPORT.md)、[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。安全漏洞请走 [SECURITY.md](./SECURITY.md)。

采用 [Apache License 2.0](./LICENSE) 许可。版权 © 2026 yibocat — 见 [NOTICE](./NOTICE)。

---

**PrismNext** — 在本地，共驾严肃科研。
