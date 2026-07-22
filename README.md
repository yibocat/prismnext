# PrismNext

**Your collaborative AI scientist — on your desk.**  
Literature · design · experiments · LaTeX — one local workspace.

[English](./README.md) | [中文](./README.zh-CN.md)



 **PrismNext** 

`🚀 Early Access`  ·  `💻 macOS · Windows`  ·  `🔒 Local-first · BYOK`  ·  `📝 LaTeX first-class`

> ✨ **Shipping fast.** The research loop is real; we are not claiming a finished “auto-publish science” product. Serious co-driving is the point.

---



## 👋 What is this?



Not another “chat that edits files.” Not an overnight black-box paper machine.  
PrismNext keeps **read → design → run → write → review** in one **local** app. The agent can drive — **you keep the gates**.

---



## 🎯 Who it’s for

- 🎓 **PhD / MSc / researchers** living in papers, experiments, and citations  
- 👥 **Small writing teams** sharing a repo, with Git / worktrees and AI that doesn’t go rogue  
- ✍️ **People who actually write LaTeX** — SyncTeX, compile, diffs — not Markdown-only  
- 🛡️ **Privacy-minded authors** — manuscripts & library on disk; bring your own keys (BYOK)

If you only want casual lit Q&A, this may be heavier than you need.  
If you want something open **all day while you work**, this is built for that.

---



## ✨ Why PrismNext?


|            | Generic coding agents      | Lit-chat / “auto AI scientist”          | **PrismNext**                                        |
| ---------- | -------------------------- | --------------------------------------- | ---------------------------------------------------- |
| 🧠 Focus   | Files + chat + tools       | Retrieval or overnight pipelines        | **Research objects with lifecycle**                  |
| 🚪 Control | Little scholarly structure | Weak daily manuscript / integrity gates | **Plan consent, approve-to-build, permission modes** |
| 💾 Data    | Cloud / IDE-centric        | Often SaaS-first                        | **Local-first + your API keys**                      |
| 📄 Outcome | “Edit the `.tex`”          | “Find papers / generate claims”         | **Read → design → run → write → cite → compile**     |


One line: **the agent advances; you keep the veto.**

---



## 🧰 What’s inside



### 📚 Literature

- Project **library** (SQLite) + PDF reading — not disposable chat attachments  
- Metadata enrich: Crossref / arXiv / OpenAlex / …  
- BibTeX in/out, citation staging & citation health  
- Search, then **stage into the local library** — your shelf grows with the project



### 🧭 Research design

- **Research Brief** — living design notes that travel with the project  
- **Plan workflow** — Build | Plan; consent before the agent enters Plan  
- Draft → **Approve** → checklist — fewer “chat wandered off” disasters



### 🧪 Experiments

- Experiment islands, run logs, artifact snapshots  
- **Provenance** — which command produced this plot / result (handy for Methods)



### ✍️ LaTeX writing

- TeX workspace (outline, find, language support)  
- **pdf.js preview + SyncTeX** both ways  
- Tectonic (default) or TeXLive; `% !TEX program` / `% !TEX root`  
- **Proposed Changes** — merge view; accept / reject per change or in bulk  
- Export PDF or source zip



### 🤖 Agent co-drive

- Multi-tab streaming chat  
- Orchestrator + experts (literature, design, methods, structure, peer review, …)  
- Skills · slash commands · knowledge modules · project rules  
- Permission modes: Ask / Edit-auto / Auto / Readonly

Drive styles:


| Mode             | Feel                                                          |
| ---------------- | ------------------------------------------------------------- |
| 👤 **Human-led** | You write & compile; ask when stuck                           |
| 🤝 **Co-drive**  | Agent pushes design / runs / prose; you approve the big beats |
| 🛰️ **AI-led**   | Maximize the work surface; nudge via the capsule bar          |




### 🛠️ Everyday shell

- Git: status, stage, diff, commit, branches, merge, stash  
- Worktrees for parallel writing contexts  
- Terminal + AI bash  
- In-app browser  
- Templates: paper / thesis / beamer / poster / CV / letter  
- UI: English · 简体中文 · 繁體中文（香港）  
- Packaged builds support **in-app updates**

---



## 🚀 How to use



### 1️⃣ Install

Grab **macOS** / **Windows** from the [download page](./website/) (or your release channel).

> 💡 On macOS, if Gatekeeper says the app is “damaged,” clear quarantine once: `xattr -cr` on the `.app`, then reopen.



### 2️⃣ Open or create a project

Pick a folder as the project root. PrismNext keeps `.prismnext/` there (library, brief, experiments, compile cache, …) — **on your disk**.

### 3️⃣ Connect your AI

**Settings** → provider + API key (BYOK).  
No “upload your thesis to our cloud” step.

### 4️⃣ Get to work

1. 📚 Add papers to the library (or search → stage)
2. 🧭 Capture the problem & path in Brief / Plan
3. ✍️ Write in TeX with live PDF
4. 🧪 Attach experiment runs & artifacts when needed
5. 🤖 Chat when stuck; use Plan / permissions for big moves
6. ✅ Review Proposed Changes — keep only what you want

---



## 🔒 What “local-first” means

- Manuscript, library, experiments, agent config → **your machine**  
- Model calls → **your keys**  
- Optional network (enrich / search MCP, …) → **explicit**, not a silent project sync

Built for unpublished data, sensitive drafts, and “I don’t want this whole project living in a SaaS.”

---



## 📸 Screenshots

Product screenshots will land in `[docs/readme/](./docs/readme/)`. For now, brand + loop art set the tone:

   

> 🙋 PRs welcome with real UI shots (welcome, TeX+PDF, library, Plan consent) under `docs/readme/screenshots/`.

---



## 🗺️ Roadmap (Early Access)

We’re deepening **co-drive**:

- 🔭 Bounded, auditable topic discovery → local library  
- 🧾 Clearer evidence / stance snapshots (not “consensus declared”)  
- 🎛️ Sharper Human / AI / Co drive modes

**Not the goal right now:** default overnight unattended discovery, auto-submission, or replacing the scientist.

---



## 🤝 Contributing & license

Issues / PRs that improve the loop, gates, or local-first UX are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md), [SUPPORT.md](./SUPPORT.md), and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security reports: [SECURITY.md](./SECURITY.md).

Licensed under the [Apache License 2.0](./LICENSE). Copyright © 2026 yibocat — see [NOTICE](./NOTICE).

---



**PrismNext**

Co-drive serious research, locally.