# prismnext

**Collaborative AI Scientist 工作台**  
本地优先的科研闭环 · 文献 · 实验 · LaTeX

[English](./README.md) | [中文](./README.zh-CN.md)

> **Early Access** — prismnext 仍在积极迭代。科研闭环与共驾模型已经落地；我们**不**宣称已是成品级「自动发论文」产品。

---

## 它是什么

**prismnext** 是一款本地优先的桌面科研工作台，覆盖完整闭环：文献 → 研究设计 → 实验 → LaTeX 成稿 → 审稿修订。在同一工作面上，你可以在 **Human-led（人主导）**、**AI-led（AI 主导）**、**Co-drive（共驾）** 之间切换。

- **OpenCode** 负责 Agent 执行（ACP）。
- **prismnext** 负责科研对象、工作区模式、提示词治理与权限闸门。

它**不是**无人值守的「隔夜发论文」引擎，也**不是**纯云端文献问答产品。LaTeX 是一等公民的写作面——但不是产品的全部。研究推理才是核心。

---

## 和其他科研 AI 有何不同

| 通用编程 Agent | 文献问答 / 「全自动 AI Scientist」叙事 | **prismnext** |
| --- | --- | --- |
| 文件树 + 对话 + 工具 | 检索或隔夜流水线 | 带生命周期的**科研对象**：brief、Plan、文献库、实验、手稿、provenance |
| 几乎没有学术流程结构 | 日常手稿控制与诚信闸门偏弱 | **有闸门的共驾**：Plan 同意、Approve & Build、权限模式、引用暂存、实验 venv 硬约束 |
| 偏云端或通用 IDE | 多为 SaaS 优先 | **本地优先 + BYOK**：项目数据在 `.prismnext/`，密钥在你本机 |
| 「帮我改 `.tex`」 | 「找论文 / 生成论断」 | **完整闭环**：读 → 设计 → 跑实验 → 写 → 引用 → 编译 |

你在工作面监测科研对象；Agent 在闸门内推进设计、计划、实验与写作；需要时用胶囊栏轻干预。我们把严肃科研的共驾做深——而不是假装取代科学家。

---

## 功能

### 科研闭环

- **Research Brief** — 活的研究设计笔记（`.prismnext/research/brief.md`）
- **Plan 工作流** — Build | Plan 会话模式；Agent 通过 `suggest-plan` 征得同意后进入；草稿 → Approve → Checklist
- **文献库** — 项目级 SQLite 库、PDF 精读、元数据 enrich（Crossref / arXiv / OpenAlex 等）、BibTeX、引用暂存与 citation health
- **实验** — 实验岛、run 日志、产物快照、provenance 查询
- **论文检索** — 内置 Paper Search MCP，再 stage 进本地库

### 写作面

- **TeX Workspace** — CodeMirror 6 + LaTeX、大纲、查找
- **PDF 预览** — pdf.js + SyncTeX 双向跳转
- **编译** — 默认 Tectonic，或 TeXLive；支持 `% !TEX program` / `% !TEX root`；导出 PDF 或源码 zip
- **Proposed Changes** — Merge 视图审阅 AI 修改，可逐条或批量接受 / 拒绝

### Agent 平台

- 多标签 OpenCode ACP 聊天、流式输出、可绑定 worktree 的会话
- **编排器 + 专家** — research-prism，以及文献 / 设计 / 方法 / 结构 / 同行评审等专家
- **Skills · 斜杠命令 · Knowledge Modules · 项目 Rules**
- **Hard / Soft 治理** — 真正的 deny / 桥接在 ACP 与 UI；工具用法写在 tool description；模块只回答「何时启用」
- 权限模式：Ask / Edit-auto / Auto / Readonly

### 工程壳层

- **Git** — 状态、暂存、diff、提交、分支、merge、stash
- **Worktree** — 并行写作上下文（`.prismnext/worktrees/`）
- **终端** — xterm + 经 PTY 桥接的 AI bash
- **浏览器** — 应用内 WebView
- **模板** — 论文、学位论文、Beamer、海报、CV、信函
- **国际化** — English、简体中文、繁體中文（香港）

---

## 架构

```text
┌─ Renderer（React 19 · Zustand · 模式）──────────────────────┐
│  Chat  │  TeX / 文献 / 实验 / Git / …                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ preload · IPC（domain:action）
┌──────────────────────────▼──────────────────────────────────┐
│  Main（services · prompts · tools · permission）            │
└──────────────────────────┬──────────────────────────────────┘
                           │ ACP（stdio JSON-RPC）
┌──────────────────────────▼──────────────────────────────────┐
│  OpenCode（单例常驻进程）                                     │
│  运行时在 app userData · skills 来自 .prismnext/agent       │
└─────────────────────────────────────────────────────────────┘

项目数据（本地优先）：
  .prismnext/
    library/       # library.db、PDF、extract
    research/      # brief + plans
    experiments/   # 实验岛 + runs
    agent/         # AGENTS.md、skills、experts
    compile/       # LaTeX 构建
    worktrees/     # git worktrees
```

**隐私立场：** 手稿、文献库、实验与 Agent 配置留在本机磁盘。`literature-search` 只查**本地**库。模型调用使用**你自己的** API Key（BYOK）。可选的目录 enrich / MCP 是显式联网，不是把项目悄悄放进云端库。

---

## 快速开始

### 使用应用

1. 从 [下载页](./website/)（或你的发布渠道）获取 **macOS** / **Windows** 安装包。
2. 打开或创建项目文件夹。
3. 在 **Settings** 中配置 AI 供应商与 API Key。
4. 在 TeX / 文献 / 实验中工作；以 Human-led 对话，或最大化工作面，用胶囊栏做 AI-led 监测。

构建配置含 Linux AppImage；当前发布 CI 以 macOS 与 Windows 为主。

### 从源码开发

**环境：** Node.js 20+、[pnpm](https://pnpm.io)，以及可编译原生模块（`node-pty`）的工具链。

```bash
# 克隆本仓库后：
pnpm install

# 下载当前平台锁定版本的 OpenCode 二进制（开发 / 打包用）
./scripts/download-opencode.sh

pnpm dev
```

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发模式（electron-vite） |
| `pnpm test` | Vitest |
| `pnpm typecheck` | TypeScript（main + renderer） |
| `pnpm build` | 生产构建 |
| `pnpm dist:mac` / `pnpm dist:win` | 打安装包（不上传） |

---

## 仓库结构

```text
src/main/        # Electron 主进程：ACP、IPC、services、prompts、tools
src/preload/     # contextBridge → electronAPI
src/renderer/    # React UI、stores、modes
tests/           # Vitest（镜像 main / renderer）
resources/       # 品牌、模板、托盘
website/         # 精简下载页
docs/            # 设计规格与计划（superpowers/）
changelog/       # 版本说明
```

---

## 路线图（Early Access）

近期方向（见内部 phase 清单）：

- 更强的、有界可审计的**主题发现**，导入本地库
- 面向共驾的 **Evidence / Stance** 快照——而不是「科学共识已判定」
- 更清晰的 **Drive Mode**（human | ai | co）产品化

**现阶段明确不做：** 默认开启的隔夜无人发现、自动投稿、复制巨型文献 SaaS 索引、替换 OpenCode 运行时。

---

## 参与贡献

欢迎提交改善科研闭环、闸门机制或本地优先体验的 Issue / PR。请把改动放进既有领域目录（`src/main/…`、`src/renderer/…`），避免为单次修补新建零散文件。

更深层的设计规格见 [`docs/superpowers/`](./docs/superpowers/)。面向用户的变更记在 [`changelog/`](./changelog/)。

---

## 许可证

本仓库的许可证条款尚未公布。再分发前请联系维护者。

---

<p align="center">
  <img src="./resources/brand/ribbon-p5-light.svg" alt="prismnext mark" width="48" />
</p>

<p align="center"><sub>prismnext — 在本地，共驾严肃科研。</sub></p>
