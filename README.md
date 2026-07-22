# prismnext

**Collaborative AI Scientist workspace**  
Local-first research loop · literature · experiments · LaTeX

[English](./README.md) | [中文](./README.zh-CN.md)

> **Early Access** — prismnext is under active development. The scholarly loop and co-driving model are real; we do not claim a finished 1.0 “auto-publish science” product.

---

## What it is

**prismnext** is a local-first desktop workspace for the full research loop: literature → research design → experiments → LaTeX manuscript → review. In the same surface you can switch among **Human-led**, **AI-led**, and **Co-drive**.

- **OpenCode** is the agent runtime (ACP).
- **prismnext** owns the research objects, workspace modes, prompt governance, and permission gates.

It is **not** an unattended “ship a paper overnight” engine, and **not** a cloud-only literature Q&A product. LaTeX is a first-class writing surface — not the whole product. Research reasoning is the core.

---

## Why it’s different

| Generic coding agents | Lit-chat / “auto AI scientist” narratives | **prismnext** |
| --- | --- | --- |
| Files + chat + tools | Retrieval or overnight pipelines | **Research objects** with lifecycle: brief, plan, library, experiments, manuscript, provenance |
| Little scholarly structure | Weak daily manuscript control & integrity gates | **Co-drive with hard gates**: Plan consent, Approve & Build, permission modes, staged citations, experiment venv rules |
| Cloud or IDE-centric | Often SaaS-first | **Local-first + BYOK**: project data under `.prismnext/`, keys on your machine |
| “Write the `.tex`” | “Find papers / generate claims” | **Full loop**: read → design → run → write → cite → compile |

You stay on the work surface; the agent advances design, plans, experiments, and writing **inside gates**. Light intervention via the AiBar capsule when you need it. We deepen serious co-driving — we do not pretend to replace the scientist.

---

## Features

### Research loop

- **Research Brief** — living design notes at `.prismnext/research/brief.md`
- **Plan workflow** — Build | Plan session modes; agent proposes Plan via `suggest-plan` (consent strip); draft → Approve → checklist
- **Literature** — project SQLite library, PDF reader, enrich (Crossref / arXiv / OpenAlex / …), BibTeX, citation staging & citation health
- **Experiments** — experiment islands, run logs, artifacts, provenance query
- **Paper search** — built-in Paper Search MCP, then stage into the local library

### Writing surface

- **TeX Workspace** — CodeMirror 6 + LaTeX language support, outline, find
- **PDF preview** — pdf.js + SyncTeX bidirectional jump
- **Compile** — Tectonic (default) or TeXLive; `% !TEX program` / `% !TEX root`; export PDF or source zip
- **Proposed Changes** — review AI edits in merge view; accept / reject per change or in bulk

### Agent platform

- Multi-tab OpenCode ACP chat, streaming, worktree-aware sessions
- **Orchestrator + experts** — research-prism plus specialized experts (literature, design, methods, structure, peer review)
- **Skills · Commands · Knowledge modules · Project rules**
- **Hard / Soft governance** — real deny/bridges in ACP & UI; tool how-tos in tool descriptions; modules answer *when*, not manuals
- Permission modes: Ask / Edit-auto / Auto / Readonly

### Engineering shell

- **Git** — status, stage, diff, commit, branches, merge, stash
- **Worktrees** — parallel writing contexts under `.prismnext/worktrees/`
- **Terminal** — xterm + AI bash via PTY bridge
- **Browser** — in-app webview
- **Templates** — paper, thesis, beamer, poster, CV, letter
- **i18n** — English, 简体中文, 繁體中文（香港）

---

## Architecture

```text
┌─ Renderer (React 19 · Zustand · modes) ─────────────────────┐
│  Chat  │  TeX / Literature / Experiments / Git / …          │
└──────────────────────────┬──────────────────────────────────┘
                           │ preload · IPC (domain:action)
┌──────────────────────────▼──────────────────────────────────┐
│  Main (services · prompts · tools · permission)             │
└──────────────────────────┬──────────────────────────────────┘
                           │ ACP (stdio JSON-RPC)
┌──────────────────────────▼──────────────────────────────────┐
│  OpenCode (single persistent process)                       │
│  runtime under app userData · skills from .prismnext/agent  │
└─────────────────────────────────────────────────────────────┘

Project data (local-first):
  .prismnext/
    library/       # library.db, PDFs, extracts
    research/      # brief + plans
    experiments/   # islands + runs
    agent/         # AGENTS.md, skills, experts
    compile/       # LaTeX build
    worktrees/     # git worktrees
```

**Privacy posture:** manuscripts, library, experiments, and agent config stay on disk. `literature-search` queries the **local** library. Model calls use **your** API keys (BYOK). Optional catalog/enrich/MCP calls are explicit, not a hidden cloud vault for your project.

---

## Getting started

### Use the app

1. Download for **macOS** or **Windows** from the [download page](./website/) (or your release channel when published).
2. Open or create a project folder.
3. Set your AI provider & API key in **Settings**.
4. Work in TeX / Literature / Experiments; chat in Human-led, or maximize the work surface for AI-led monitoring with the capsule bar.

Linux AppImage packaging exists in the build config; current release CI focuses on macOS and Windows.

### Develop from source

**Requirements:** Node.js 20+, [pnpm](https://pnpm.io), and a platform toolchain for native modules (`node-pty`).

```bash
# Clone this repository, then:
pnpm install

# Download the pinned OpenCode binary for your platform (dev / packaging)
./scripts/download-opencode.sh

pnpm dev
```

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev app (electron-vite) |
| `pnpm test` | Vitest |
| `pnpm typecheck` | TypeScript (main + renderer) |
| `pnpm build` | Production build |
| `pnpm dist:mac` / `pnpm dist:win` | Package installers (no publish) |

---

## Repository layout

```text
src/main/        # Electron main: ACP, IPC, services, prompts, tools
src/preload/     # contextBridge → electronAPI
src/renderer/    # React UI, stores, modes
tests/           # Vitest (mirrors main / renderer)
resources/       # Brand, templates, tray
website/         # Minimal download page
docs/            # Design specs & plans (superpowers/)
changelog/       # Version notes
```

---

## Roadmap (Early Access)

Near-term direction (see internal phase inventory):

- Stronger **topic discovery** into the local library (bounded, auditable)
- **Evidence / stance** snapshots for co-drive — not “consensus declared”
- Clearer **Drive Mode** (human | ai | co) productization

**Explicitly out of scope for now:** overnight unattended discovery as default, automatic submission, cloning a giant lit-SaaS index, replacing the OpenCode runtime.

---

## Contributing

Issues and pull requests that improve the research loop, gates, or local-first ergonomics are welcome. Please keep changes in the existing domain homes (`src/main/…`, `src/renderer/…`) rather than one-off patch files.

Design history and deeper specs live under [`docs/superpowers/`](./docs/superpowers/). User-facing changes are logged in [`changelog/`](./changelog/).

---

## License

License terms for this repository are not yet published. Contact the maintainers before redistribution.

---

<p align="center">
  <img src="./resources/brand/ribbon-p5-light.svg" alt="prismnext mark" width="48" />
</p>

<p align="center"><sub>prismnext — co-drive serious research, locally.</sub></p>
