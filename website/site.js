(() => {
  const STRINGS = {
    en: {
      title: "PrismNext — a local-first research desk",
      eyebrow: "Early Access",
      navLoop: "§1 Loop",
      navArch: "§2 Architecture",
      navCaps: "§3 Capabilities",
      navPro: "§4 Pro Teams",
      navRefs: "References",
      navHome: "Home",
      navPrivacy: "Privacy",
      navTerms: "Terms",
      navPrivacyPolicy: "Privacy Policy",
      navTermsOfUse: "Terms of Use",
      navNotices: "Licenses",
      navNoticesFull: "Open Source",
      navSecurity: "Security",
      titlePrivacy: "PrismNext — Privacy Policy",
      titleTerms: "PrismNext — Terms of Use",
      titleNotices: "PrismNext — Open Source Notices",
      titleSecurity: "PrismNext — Security",
      titleNotFound: "PrismNext — Page not found",
      footCopy: "© 2026 yibocat",
      pubMeta: "Preprint",
      versionLabel: "Version",
      authors:
        "A local-first, multi-project research workbench — powered by a research-enhanced embedded Pi agent and Teams v2.",
      abstractTitle: "Abstract",
      abstractText:
        "PrismNext unifies read → design → run → write → review on a multi-project local desk. A research-enhanced embedded Pi agent and Teams v2 (Lead orchestrator + specialists + skills + MCP) operate across per-project libraries, monitored experiment runs, notes, Git with remote sync and agent-turn change lenses, and native LaTeX. Manuscripts stay in your Git tree; project metadata in .workbench/; cross-project state in ~/.prismnext/. One installer across platforms: free core out of the box, pro specialty teams via local license verification.",
      keywordsLabel: "Keywords",
      keywords:
        "local-first · Workbench · embedded Pi · Teams v2 · execution plane · LaTeX · provenance · gated multi-agent",
      pillars: "Local-first · Open-Core · Bring your own API key · Zero telemetry",
      mn1: "co-drive, not autopilot →",
      loopTitle: "The research loop",
      loopLede:
        "Ideation, literature, experiments, and writing stay on the same local desk — staffed by the active Team, not four disconnected tools.",
      loopIdeation: "Ideation & Plan",
      loopIdeationDef: "Problem formulation, Brief, and interactive Plan (⌥P) approval gates.",
      loopLiterature: "Literature",
      loopLiteratureDef: "SQLite library, Zotero sync, MinerU parsing, and continuous citation auditing.",
      loopExperiment: "Experiment",
      loopExperimentDef: "Unified terminal execution plane, live Job Monitor, and Methods provenance.",
      loopWriting: "Writing",
      loopWritingDef: "First-class LaTeX, bundled Tectonic compilation, and Proposed Changes merge diffs.",
      figManifold: "The research manifold — drag to rotate; the surface is live.",
      mn2: "read → design → run → write",
      archTitle: "System Architecture",
      archLede:
        "PrismNext is engineered around five pillars for rigorous, reproducible scientific computing on a multi-project desk.",
      archWorkbench: "Multi-Project Workbench",
      archWorkbenchDef:
        "Several paper folders stay open on one desk — each with its own chats, file tree, library slot, and modes. Switching focus changes the center and right panels without killing background agents.",
      archStorage: "Local-First Storage Boundary",
      archStorageDef:
        "Your manuscript lives in the project Git tree. Structured metadata — agent instructions, compile cache, experiments, teams — lives in .workbench/. Cross-project state — chat sessions, per-project libraries, agent worktree checkouts, skills, and teams — lives in ~/.prismnext/. File watchers stay locked to authorized roots.",
      archPi: "Embedded Pi Agent + Teams v2",
      archPiDef:
        "Chat runs on a research-enhanced Pi host in the main process (agent:* IPC). Teams v2 staffs the desk: one Lead voice, Task-delegated specialists, skills, slash commands, and team MCP servers. PermissionGate keeps consequential tools behind explicit Allow / Deny cards.",
      archJobs: "Unified Terminal Execution Plane",
      archJobsDef:
        "Chat bash commands and experiment runs share a unified executionId state machine. The read-only Job Monitor attaches directly to active process streams. Auto-logs receipts (command, exit code, duration, transcript, outputs) into runs.jsonl for direct citation in Methods.",
      archOneApp: "Open-Core & Unified Single Installer",
      archOneAppDef:
        "The core desktop shell and compiler engine are open source (Apache-2.0). Official releases ship as one unified binary across macOS, Windows, and Linux. Free features are unlocked out of the box; pro specialty teams are verified locally without cloud roundtrips.",
      mn8: "several papers, one desk →",
      showcaseTitle: "Capabilities",
      showcaseLede:
        "Evidence over adjectives — nine integrated surfaces shipping in today's build, themed live by the header palette.",
      shotHomeTitle: "One prompt box, staffed by the active Team",
      shotHomeText:
        "Select a Team, model, and allowed skills. The embedded Pi agent staffs the composer across literature discovery, mathematical derivations, experiment execution, or LaTeX drafting — per project, on one workbench.",
      figHome: "The session composer — Team, model, and skills at hand. Drag for light vs dark.",
      shotLitTitle: "Literature, searched and shelved",
      shotLitText:
        "Cross-database search across Crossref, arXiv, and OpenAlex. Two-way Zotero sync and MinerU PDF parsing. Continuous citation health audits verify .tex ↔ .bib ↔ library consistency.",
      figLit: "Search results with shelf status, one click from the library.",
      shotReadTitle: "Reading with a co-pilot",
      shotReadText:
        "Side-by-side PDF reader with section-linked margin notes. Ask questions about specific lemmas, experimental claims, or plots with automatic page citations.",
      figRead: "The paper and its reading companion, side by side.",
      shotIntensiveTitle: "Intensive reading, formula by formula",
      shotIntensiveText:
        "Lasso any complex mathematical equation or theorem. The agent unpacks notation, verifies step-by-step derivations, and flags implicit assumptions.",
      figIntensive: "A lassoed formula, explained line by line.",
      shotNotesTitle: "Notes that write back",
      shotNotesText:
        "Derivations, reading cards, and exploratory sketches live in project notes. The active Team structures, expands, and cross-references them as your ideas mature.",
      figNotes: "Notes on the left, agent expansion on the right.",
      shotExpTitle: "Experiments with provenance",
      shotExpText:
        "The active Team formulates experimental matrices, dispatches jobs, and files complete receipts into runs.jsonl — command, exit code, runtime, stdout/stderr, and artifact links.",
      figExp: "A finished run with its full provenance receipt.",
      shotGitTitle: "Git & Worktrees, built into the workspace",
      shotGitText:
        "Every step lands in Git. Visual diffs, remote fetch/pull/publish, GitHub PR creation, agent-turn change lenses, branch management, and isolated worktree checkouts — all inside the workspace.",
      figGit: "Visual diff viewer and commit management.",
      shotWritingTitle: "First-class LaTeX authoring",
      shotWritingText:
        "A native TeX workbench: document outline, instant PDF synchronization, bundled Tectonic compilation, and Proposed Changes review for human-in-the-loop draft editing.",
      figWriting: "Source code, outline, and live compiled PDF.",
      shotModelsTitle: "Every provider, your keys",
      shotModelsText:
        "DeepSeek, Claude, Gemini, GPT, Grok, Kimi, Qwen, MiniMax, or local custom endpoints. Switch providers mid-session with full BYOK privacy.",
      figModels: "Multi-provider configuration — zero Prism cloud.",
      shotAgentTitle: "Interactive research, human in the loop",
      shotAgentText:
        "The team proposes, you dispose: Plans require explicit consent, file changes provide visual diffs, and permission modes enforce strict boundaries.",
      figAgent: "An interactive session — the team acts under strict human governance.",
      skillsTitle: "Research standards, codified (29 Skills)",
      skillsText:
        "29 bundled scientific skills in PrismNext Core — each complete with formal protocol tables, LaTeX templates, and verification scripts.",
      skillTierDesign: "Ideate, design & run · 7",
      skillTierWriting: "Writing · 7",
      skillTierFigures: "Figures · 5",
      skillTierReview: "Reading & review · 5",
      skillTierMeta: "Math & meta · 5",
      skIdeaLab: "Divergence before judgment, ideas persisted in dedicated folders.",
      skRelatedWork: "Library-to-synthesis narrative with grounded citations.",
      skReadingNotes: "Structured extraction and argument breakdown from PDFs.",
      skHypothesis: "Sharpen a research question into falsifiable hypotheses.",
      skDesignMatrix: "Fix factorial / ablation matrix and compute budgets before execution.",
      skToMethods: "Convert execution receipts into publication-ready Methods prose.",
      skFigurePipeline: "Data → figure script → LaTeX inclusion end-to-end.",
      skCriticalReview: "Devil's advocate peer review across claims, proofs, and evidence.",
      skRebuttal: "Point-by-point reviewer rebuttal drafting.",
      skPreflight: "Pre-submission gate: compilation, citations, desk-reject risks.",
      skStatRigor: "Test selection, effect sizes, power analysis scripts.",
      skPrisma: "PRISMA 2020 protocol, screening log, and flow counts.",
      skSciVis: "Colorblind-safe styling and journal dimension guidelines.",
      skObservable: "Density, hexbin, facets, geo views — headless SVG generation.",
      skSymMath: "SymPy-verified derivations exported directly to LaTeX.",
      skMathNumeric: "Seeded probes, convergence orders, and worst-case error bounds.",
      skManifold: "Connections, curvature, geodesics, gauge invariants verification.",
      skLattice: "Gröbner-basis membership, LLL lattice equivalence, number fields.",
      skTikz: "Compilation-ready TikZ / pgfplots templates.",
      skInteraction: "Interactive RightArea figures and plot contracts.",
      skMlProtocol: "Multi-seed discipline, baseline fairness, aggregation scripts.",
      skMgmtSci: "DiD / IV / RDD econometric battery and behavioral experiment checks.",
      skSkillCreator: "Distill reproducible research workflows into custom skills.",
      skWritingDesign: "Outline gate before prose: promise map and argument arcs.",
      skIntro: "Problem-driven, contribution-first, or story-arc structures.",
      skPrelims: "Notation tables, problem setup, and symbol consistency.",
      skMethodsCh: "Motivation-driven structure backed by experiment receipts.",
      skResults: "Numbers carry run ids; negative results reported honestly.",
      skConclusion: "Resolves Introduction questions and articulates real limitations.",
      skNameIdeaLab: "Idea lab",
      skNameWritingDesign: "Writing design",
      skNameIntro: "Introduction",
      skNamePrelims: "Preliminaries",
      skNameMethodsCh: "Methods chapter",
      skNameResults: "Results",
      skNameConclusion: "Conclusion",
      skNameRelated: "Related work",
      skNameNotes: "Intensive reading notes",
      skNameHypothesis: "Hypothesis design",
      skNameMatrix: "Experiment design matrix",
      skNameMethods: "Experiment-to-Methods",
      skNameFigure: "Figure pipeline",
      skNameReview: "Critical review",
      skNameRebuttal: "Rebuttal letter",
      skNamePreflight: "Manuscript preflight",
      skNameStats: "Statistical rigor",
      skNamePrisma: "PRISMA systematic review",
      skNameVis: "Matplotlib figures",
      skNameObservable: "Observable Plot figures",
      skNameSympy: "Symbolic math",
      skNameMathNumeric: "Numeric verification",
      skNameManifold: "Manifold & geometry",
      skNameLattice: "Lattice & algebra",
      skNameTikz: "TikZ & pgfplots",
      skNamePanel: "Panel figures",
      skNameMl: "ML experiment protocol",
      skNameMgmt: "Management & decision science",
      skNameCreator: "Skill creator",
      proTitle: "Pro Specialty Teams & Early Access",
      proLede:
        "The open-source Host and PrismNext Core are always usable without a license. The official beta installer also contains eight optional Pro teams. License eligibility is evaluated locally, and the Early Access test key unlocks the complete Pro suite.",
      proIdeaArena: "Idea Arena",
      proIdeaArenaDef:
        "A structured debate on one concrete research idea: steel-man, devil's advocate, historian, analogizer, and pragmatist build a decision memo before you commit resources.",
      proCommittee: "The Committee",
      proCommitteeDef:
        "A demanding mock thesis committee for proposal, midterm, or pre-defense, followed by a closed-door advisor debrief and recovery roadmap.",
      proRebuttal: "Rebuttal War Room",
      proRebuttalDef:
        "Classifies each reviewer point, asks you to confirm an accept/clarify/refuse strategy, then drafts a point-by-point response without changing that strategy.",
      proMilestone: "Milestone Coach",
      proMilestoneDef:
        "Coaches a multi-year research programme: the narrative through-line, portfolio gaps against promotion standards, and a submission timeline.",
      proClaimPolice: "Claim Police",
      proClaimPoliceDef:
        "Produces claim–evidence–hedge audit tickets across a manuscript; it identifies statements that outrun evidence but does not rewrite the paper.",
      proTranslation: "Translation Table",
      proTranslationDef:
        "Aligns one claim across two disciplines: domain purists assess it independently, a translator maps terminology, then an applicability judge rules on feasibility and novelty asymmetry.",
      proTopicBrainstorm: "Topic Brainstorm",
      proTopicBrainstormDef:
        "Turns a vague research interest into testable hypothesis cards through deliberate divergence, convergence, and a documented kill list.",
      proIdeaLedger: "Idea Ledger",
      proIdeaLedgerDef:
        "Keeps a durable record of closed ideas, their closure reasons, and the conditions required to reopen them.",
      eaHead: "Free Early Access Activation",
      eaText:
        "During the public preview, all Pro specialty teams can be activated for free. Go to Settings (⌘, / Ctrl+,) → About, enter the test key PRISM-PRO-DEV-TEST, and click Activate.",
      mn9: "unlocked via PRISM-PRO-DEV-TEST →",
      mn3: "all local — .workbench/ + ~/.prismnext/",
      mn5: "fork it on GitHub →",
      mn6: "figures wear the current pack →",
      mn7: "runnable, not rhetoric ↓",
      compareLight: "Light",
      compareDark: "Dark",
      backdropMenuLabel: "Backdrop",
      backdropInk: "Ink strokes",
      backdropAcademic: "Academic watermark",
      backdropOrigami: "Scribbles",
      backdropRain: "Night rain",
      backdropForest: "Falling leaves",
      backdropBlueprint: "Blueprint",
      backdropStarfield: "Day & night sky",
      backdropCircuit: "Circuit traces",
      backdropBookshelf: "Bookshelf",
      backdropClips: "Clips & bookmark",
      backdropPaperplane: "Paper planes",
      backdropStamp: "Draft stamp",
      backdropPendulum: "Pendulum",
      backdropConstellation: "Constellation",
      themeModeLight: "Light",
      themeModeDark: "Dark",
      themeModeSystem: "System",
      principlesTitle: "Axioms",
      pLocalTitle: "Axiom 1 (Locality).",
      pLocalText: "Your projects stay strictly on your local machine.",
      pPrivacyTitle: "Axiom 2 (Privacy).",
      pPrivacyText:
        "No product telemetry or analytics. We do not collect usage data or operate a PrismNext cloud.",
      pKeyTitle: "Axiom 3 (Keys).",
      pKeyText: "Model calls route directly to providers using your own API keys — no Prism cloud, no middleman.",
      pVetoTitle: "Axiom 4 (Veto).",
      pVetoText: "Every automated move is gated and auditable; the researcher retains absolute veto power.",
      refsTitle: "References",
      refSource: "PrismNext source code",
      refReleases: "PrismNext releases",
      refGithub: "Author's GitHub",
      refEmail: "Contact",
      foot: "Local-first collaborative AI research desk — set in Instrument Serif, Sora & Plex Mono.",
      footFine: "© 2026 yibocat",
      osMac: "macOS",
      osWin: "Windows",
      osLinux: "Linux",
      fmtMac: ".dmg",
      fmtWin: ".exe",
      fmtLinux: "AppImage",
      metaUnavailable: "Release metadata unavailable.",
      themeGroup: "Theme",
      langGroup: "Language",
      downloadsLabel: "Downloads",
    },
    zh: {
      title: "PrismNext — 本地优先的科研书桌",
      eyebrow: "Early Access",
      navLoop: "§1 闭环",
      navArch: "§2 架构",
      navCaps: "§3 能力",
      navPro: "§4 Pro 团队",
      navRefs: "参考文献",
      navHome: "首页",
      navPrivacy: "隐私",
      navTerms: "条款",
      navPrivacyPolicy: "隐私政策",
      navTermsOfUse: "使用条款",
      navNotices: "许可",
      navNoticesFull: "开源声明",
      navSecurity: "安全",
      titlePrivacy: "PrismNext — 隐私政策",
      titleTerms: "PrismNext — 使用条款",
      titleNotices: "PrismNext — 开源与第三方声明",
      titleSecurity: "PrismNext — 安全报告",
      titleNotFound: "PrismNext — 页面不存在",
      footCopy: "© 2026 yibocat",
      pubMeta: "预印本",
      versionLabel: "版本",
      authors:
        "本地优先的多项目科研工作台 —— 由科研增强型嵌入式 Pi Agent 与 Teams v2 协同驱动。",
      abstractTitle: "摘要",
      abstractText:
        "PrismNext 将读 → 规划 → 实验 → 撰写 → 审阅收拢于多项目本地书桌。科研增强型嵌入式 Pi Agent 与 Teams v2（Lead 主脑 + 专科专家 + 技能 + MCP）直接操作按项目隔离的文献库、可监视的实验运行、笔记、带远程同步与 Agent 轮次变更透镜的 Git，以及原生 LaTeX。手稿留在 Git 树；项目元数据在 .workbench/；跨项目状态在 ~/.prismnext/。全平台单一安装包：免费核心开箱即用，Pro 专科团队本地许可证即时解锁。",
      keywordsLabel: "关键词",
      keywords:
        "本地优先 · Workbench · 嵌入式 Pi · Teams v2 · 执行控制平面 · LaTeX · 实验溯源 · 有闸门的多智能体",
      pillars: "本地优先 · 开源核心 · 自备 API Key · 零数据遥测",
      mn1: "共驾，不是自动驾驶 →",
      loopTitle: "科研闭环",
      loopLede: "构思、文献、实验、撰写留在同一张本地书桌上——由当前活跃 Team 坐镇，而不是四个割裂的工具。",
      loopIdeation: "构思与规划",
      loopIdeationDef: "问题提炼、Research Brief 与交互式 Plan（⌥P）审批闸门。",
      loopLiterature: "文献库",
      loopLiteratureDef: "SQLite 本地文献库、Zotero 双向同步、MinerU 解析与持续引用审计。",
      loopExperiment: "实验工作区",
      loopExperimentDef: "统一作业执行控制平面、实时 Job Monitor 监视与 Methods 级收据溯源。",
      loopWriting: "学术写作",
      loopWritingDef: "原生 LaTeX、内置 Tectonic 编译、实时双向同步预览与 Proposed Changes 差异审阅。",
      figManifold: "科研流形——拖拽旋转，曲面是实时渲染的。",
      mn2: "读 → 设计 → 跑 → 写",
      archTitle: "系统架构",
      archLede: "PrismNext 围绕五大工程支柱构建，在多项目书桌上实现严密、可复现的科学研究计算。",
      archWorkbench: "多项目 Workbench",
      archWorkbenchDef:
        "多张论文文件夹同时驻留于同一书桌——各自拥有独立的对话、文件树、文献槽位与模式面板。切换焦点时，中心区与右侧面板随之切换，后台 Agent 不被终止。",
      archStorage: "本地优先存储边界",
      archStorageDef:
        "手稿位于项目 Git 树。结构化元数据——Agent 说明、编译缓存、实验、团队——存于 .workbench/。跨项目状态——对话会话、按项目文献库、Agent worktree 签出、技能与团队——存于 ~/.prismnext/。文件监听严格锁定于授权根目录。",
      archPi: "嵌入式 Pi Agent + Teams v2",
      archPiDef:
        "Chat 由主进程内的科研增强型 Pi 宿主驱动（agent:* IPC）。Teams v2 坐镇书桌：单一 Lead 对话声线、Task 委派专科、技能、斜杠命令与团队 MCP。PermissionGate 将高风险工具置于显式 Allow / Deny 卡片之后。",
      archJobs: "统一作业执行控制平面",
      archJobsDef:
        "Chat 中的 Bash 命令与实验运行共享统一 executionId 状态机。只读 Job Monitor 直连进程实时输出流。运行回执（命令、退出码、时长、日志、产物）自动固化至 runs.jsonl，可直接引用至论文 Methods。",
      archOneApp: "开源核心与统一二进制分发",
      archOneAppDef:
        "桌面客户端与编译内核完全开源（Apache-2.0）。官方发布为全平台（macOS、Windows、Linux）单一统一安装包。核心免费能力开箱即用；Pro 专科能力由本地许可证即时求值生效，无需云端往返。",
      mn8: "多篇论文，一张书桌 →",
      showcaseTitle: "核心能力一览",
      showcaseLede: "证据胜于形容词——九大集成科研工作面，每张截图均实时适配顶栏选中的出版级主题包与手绘背景。",
      shotHomeTitle: "一个输入框，调动当前 Team 全局能力",
      shotHomeText:
        "选择活跃 Team、模型与可用技能。嵌入式 Pi Agent 在同一 Workbench 上，按项目驱动 Composer 发起文献检索、数学推导、实验运行或手稿起草。",
      figHome: "会话 Composer——Team、模型与技能随取。拖动对比浅色与深色。",
      shotLitTitle: "文献库：检索、解析与入库",
      shotLitText: "跨 Crossref、arXiv、OpenAlex 全量检索。Zotero 双向同步与 MinerU 高精度 PDF 解析。实时健康检查保证 .tex ↔ .bib ↔ 文献库三向一致。",
      figLit: "检索结果自带入库状态，一键沉淀至项目文献库。",
      shotReadTitle: "并排伴读与交互式问答",
      shotReadText: "PDF 在一侧，伴读智能体在另一侧。针对引理、定理或实验图表进行针对性提问，回答自动标注对应页码引用。",
      figRead: "论文手稿与伴读智能体，并排而立。",
      shotIntensiveTitle: "精读模式：公式定理逐行拆解",
      shotIntensiveText: "框选任意复杂数学公式或推导段落，智能体拆解数学记号、给出逐步推导证明，并明确指出隐式假设条件。",
      figIntensive: "被框选的公式推导，逐行严密剖析。",
      shotNotesTitle: "会主动回写的结构化笔记",
      shotNotesText: "数学推导、阅读卡片与探索性构思沉淀于项目笔记。当前 Team 随着研究深入协助你扩写、整理与建立交叉索引。",
      figNotes: "左侧为结构化笔记，右侧由智能体实时协助展开。",
      shotExpTitle: "带完整溯源（Provenance）的实验运行",
      shotExpText: "当前 Team 协助制定实验矩阵、派发作业，并自动将完整回执写入 runs.jsonl——包含命令、退出码、时长、日志与图表产物。",
      figExp: "一次完成的实验运行及其完整科研收据。",
      shotGitTitle: "内置 Git 差异审阅与工作树隔离",
      shotGitText:
        "每一步探索均进入 Git。在工作区内部进行可视化差异、远程 fetch/pull/publish、GitHub PR 创建、Agent 轮次变更透镜、分支管理与独立 worktree 签出。",
      figGit: "并排差异对比与版本提交管理。",
      shotWritingTitle: "一等公民的原生 LaTeX 撰写",
      shotWritingText: "原生 TeX 工作台：大纲导航、实时 PDF 快速同步、内置 Tectonic 编译，以及审阅修改稿件专用的 Proposed Changes 差异视图。",
      figWriting: "LaTeX 源码、大纲目录与实时编译的 PDF 预览。",
      shotModelsTitle: "任意模型供应商，自备 API Key",
      shotModelsText: "DeepSeek、Claude、Gemini、GPT、Grok、Kimi、Qwen、MiniMax 或本地自定义端点。任务途中随时无缝换轨，100% 保护隐私。",
      figModels: "多模型供应商配置面板——零中转，零 Prism 云端。",
      shotAgentTitle: "可交互式科研，人类保持终审否决",
      shotAgentText: "智能体提案，研究人员定夺：重大操作必须经 Plan 审批，文件修改给出清晰差异对比，权限模式严格划定边界。",
      figAgent: "工作会话进行中——团队在严格的人类治理闸门下运行。",
      skillsTitle: "固化的科研规范（29 项开箱技能）",
      skillsText:
        "PrismNext Core 团队预置 29 项严密的科研技能——每项技能均配备标准协议表、LaTeX 模板与可执行验证脚本。技能归属于 Team，由当前允许名单自动加载。",
      skillTierDesign: "构想、设计与运行 · 7",
      skillTierWriting: "学术写作 · 7",
      skillTierFigures: "图表绘制 · 5",
      skillTierReview: "阅读与评审 · 5",
      skillTierMeta: "数学与元能力 · 5",
      skIdeaLab: "大胆发散后收敛头脑风暴，构思持久化沉淀于 ideas/ 目录。",
      skRelatedWork: "从文献库到相关工作综述叙事，引用均具备实体出处。",
      skReadingNotes: "从 PDF 中提取结构化精读笔记与核心论证。",
      skHypothesis: "将粗糙科研问题提炼为严密的可证伪假说。",
      skDesignMatrix: "运行前确定全因子/消融实验矩阵与算力预算分配。",
      skToMethods: "将真实运行回执转化为符合期刊标准的 Methods 正文描述。",
      skFigurePipeline: "数据 → 绘图脚本 → LaTeX 引用端到端全链路流水线。",
      skCriticalReview: "逆向批判性同行盲审，审视主张、证明链条与实验支撑。",
      skRebuttal: "逐点回复审稿人意见（Point-by-point Rebuttal）起草。",
      skPreflight: "投稿前终审闸门：编译完整性、引用准确性与拒稿风险排查。",
      skStatRigor: "统计检验选型、效应量计算与可执行的统计功效分析。",
      skPrisma: "PRISMA 2020 文献筛选协议、筛选日志与流程计数记录。",
      skSciVis: "期刊级色盲安全 Matplotlib 样式与选图规范指南。",
      skObservable: "密度、hexbin、分面、地理视图——Headless 脚本直出高质量矢量 SVG。",
      skSymMath: "SymPy 符号推导验证，数学证明结论直达 LaTeX 公式。",
      skMathNumeric: "种子化数值探针、收敛阶检验与最坏误差界估计（PASS/FAIL）。",
      skManifold: "联络、曲率、测地线、和乐与规范不变量计算验证。",
      skLattice: "Gröbner 基成员判定、LLL 格基约化等价与代数数域计算。",
      skTikz: "开箱即编译的专业 TikZ 与 pgfplots 矢量图模板库。",
      skInteraction: "右侧面板可交互科学绘图与数据对象协议标准。",
      skMlProtocol: "实证机器学习多随机种子、公平基线对比与成果聚合协议。",
      skMgmtSci: "双重差分（DiD）、工具变量（IV）、断点回归（RDD）等计量实证检验。",
      skSkillCreator: "将验证走通的实验工作流自动蒸馏为可复用的科研技能。",
      skWritingDesign: "动笔前的大纲规划闸门：故事叙事线与论文承诺映射图。",
      skIntro: "问题驱动、贡献优先或故事弧线结构模板——规范是参照，不是模具。",
      skPrelims: "数学记号表、问题形式化设定与符号全局一致性维护。",
      skMethodsCh: "动机驱动的方法论篇章构建，严密衔接实验真实收据。",
      skResults: "结果数据严格携带 run id 标记，客观忠实报告阴性结果。",
      skConclusion: "紧扣引言研究问题，坦诚阐述理论与实验的真实局限性。",
      skNameIdeaLab: "想法实验室",
      skNameWritingDesign: "写作设计",
      skNameIntro: "引言起草",
      skNamePrelims: "预备知识",
      skNameMethodsCh: "方法论章节",
      skNameResults: "实验结果",
      skNameConclusion: "结论与局限",
      skNameRelated: "相关工作",
      skNameNotes: "精读笔记",
      skNameHypothesis: "假说设计",
      skNameMatrix: "实验设计矩阵",
      skNameMethods: "实验日志成文",
      skNameFigure: "图表流水线",
      skNameReview: "批判性深审",
      skNameRebuttal: "审稿答辩回复",
      skNamePreflight: "手稿预检闸门",
      skNameStats: "统计严谨性",
      skNamePrisma: "PRISMA 系统综述",
      skNameVis: "Matplotlib 绘图",
      skNameObservable: "Observable Plot 绘图",
      skNameSympy: "符号推导验证",
      skNameMathNumeric: "数值精度验证",
      skNameManifold: "微分流形与几何",
      skNameLattice: "格论与近世代数",
      skNameTikz: "TikZ 矢量图模板",
      skNamePanel: "面板图绘制规范",
      skNameMl: "实证 ML 协议",
      skNameMgmt: "管理与计量科学",
      skNameCreator: "技能自动蒸馏",
      proTitle: "Pro 专题团队与抢先体验",
      proLede: "开源 Host 与 PrismNext Core 始终无需许可证即可使用。官方 beta 安装包还内置 8 个可选 Pro 团队；资格完全在本地校验，Early Access 测试密钥可一并解锁完整 Pro 套件。",
      proIdeaArena: "想法论辩场",
      proIdeaArenaDef: "围绕一个明确研究想法展开结构化论辩：正方、反方、学术史学者、类比专家与务实派共同形成决策备忘录，再决定是否投入资源。",
      proCommittee: "答辩委员会",
      proCommitteeDef: "模拟开题、中期或预答辩的严苛学位委员会；听证结束后，友好导师在闭门环节给出恢复路线图。",
      proRebuttal: "审稿答辩作战室",
      proRebuttalDef: "逐条分类审稿意见，待你确认接受、澄清或拒绝的处理策略后，再据此起草逐点回复，不擅自改变策略。",
      proMilestone: "学术生涯里程碑教练",
      proMilestoneDef: "服务多年的研究计划：梳理贯穿主线、对照晋升标准审计成果组合缺口，并安排投稿时间线。",
      proClaimPolice: "主张核验",
      proClaimPoliceDef: "对手稿执行「主张—证据—限定语」审计，开出超出证据范围的陈述工单；只核验，不代写论文。",
      proTranslation: "跨学科对照台",
      proTranslationDef: "让两个学科分别审视同一主张，再由译者对齐术语，最后判断可行性与「在一方平凡、在另一方新颖」的差异。",
      proTopicBrainstorm: "选题脑暴",
      proTopicBrainstormDef: "将模糊研究兴趣依次发散、收敛，并以有记录的淘汰清单筛选，最终形成可检验的假说卡片。",
      proIdeaLedger: "想法账本",
      proIdeaLedgerDef: "持久记录已关闭的研究想法、关闭原因，以及之后重新开启所需满足的条件。",
      eaHead: "抢先体验：免费激活",
      eaText: "在公开测试期间，全部 Pro 专题团队均可免费体验。进入「设置」（⌘, / Ctrl+,）→「关于」，输入测试密钥 PRISM-PRO-DEV-TEST，再点击「激活」即可立即解锁。",
      mn9: "测试密钥 PRISM-PRO-DEV-TEST →",
      mn3: "数据 100% 本地 —— .workbench/ + ~/.prismnext/",
      mn5: "欢迎 Star 与 Fork →",
      mn6: "截图随主题实时变装 →",
      mn7: "条条皆可运行，绝非概念口号 ↓",
      compareLight: "浅色",
      compareDark: "深色",
      backdropMenuLabel: "背景样式",
      backdropInk: "墨迹草稿",
      backdropAcademic: "学术水印",
      backdropOrigami: "随意涂画",
      backdropRain: "夜雨淅沥",
      backdropForest: "飘落秋叶",
      backdropBlueprint: "蓝图线稿",
      backdropStarfield: "晴空星夜",
      backdropCircuit: "电路排线",
      backdropBookshelf: "书架层叠",
      backdropClips: "回形针与书签",
      backdropPaperplane: "纸飞机",
      backdropStamp: "草稿印章",
      backdropPendulum: "重力钟摆",
      backdropConstellation: "星座连线",
      themeModeLight: "浅色",
      themeModeDark: "深色",
      themeModeSystem: "跟随系统",
      principlesTitle: "设计公理",
      pLocalTitle: "公理 1（绝对本地性）。",
      pLocalText: "所有科研项目数据、手稿与数据库严格保留在你的本地机器上。",
      pPrivacyTitle: "公理 2（零遥测隐私）。",
      pPrivacyText: "无产品遥测、无行为分析。我们不收集使用数据，也不运营 PrismNext 云。",
      pKeyTitle: "公理 3（自带密钥 BYOK）。",
      pKeyText: "模型调用走你自己的 API Key 与你信赖的供应商——无中转代理，绝无 Prism 云端。",
      pVetoTitle: "公理 4（人类终审否决）。",
      pVetoText: "所有自动化操作均受闸门约束且完全可审计；研究人员始终享有最终绝对否决权。",
      refsTitle: "参考文献与链接",
      refSource: "PrismNext 开源仓库",
      refReleases: "PrismNext 发布版本",
      refGithub: "作者 GitHub",
      refEmail: "联系邮箱",
      foot: "本地优先的协作式 AI 科研工作台 —— 排版于 Instrument Serif、Sora 与 Plex Mono。",
      footFine: "© 2026 yibocat",
      osMac: "macOS",
      osWin: "Windows",
      osLinux: "Linux",
      fmtMac: ".dmg",
      fmtWin: ".exe",
      fmtLinux: "AppImage",
      metaUnavailable: "暂时无法加载版本元数据。",
      themeGroup: "主题",
      langGroup: "语言",
      downloadsLabel: "下载",
    },
  };

  function detectLang() {
    const saved = localStorage.getItem("prismnext-lang");
    if (saved === "en" || saved === "zh") return saved;
    const nav = (navigator.language || "en").toLowerCase();
    return nav.startsWith("zh") ? "zh" : "en";
  }

  function detectThemeMode() {
    const saved = localStorage.getItem("prismnext-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  }

  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/Windows/i.test(ua) || /Win/i.test(platform)) return "win";
    if (/Android/i.test(ua)) return "other";
    if (/Linux/i.test(ua) || /Linux/i.test(platform)) return "linux";
    if (/Mac|iPhone|iPad|iPod/i.test(ua) || /Mac/i.test(platform)) return "mac";
    return "other";
  }

  function defaultVersion() {
    return document.querySelector('meta[name="prismnext-version"]')?.content || "0.0.0-dev";
  }

  function versionJsonUrls() {
    const base = window.__RELEASES_BASE__;
    const isPlaceholder = !base || String(base).includes("REPLACE_WITH_R2_PUBLIC_BASE_URL");
    if (isPlaceholder) return ["./version.json"];
    const normalized = String(base).replace(/\/$/, "");
    return [
      `${normalized}/pro/stable/version.json`,
      "./version.json",
    ];
  }

  async function loadVersionJson() {
    for (const url of versionJsonUrls()) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) return res.json();
      } catch (_) {
        /* try next */
      }
    }
    throw new Error("Failed to load version.json");
  }

  let lang = detectLang();
  let themeMode = detectThemeMode();
  let themePreview = null;
  let release = {
    version: defaultVersion(),
    macUrl: "#",
    winUrl: "#",
    linuxUrl: "#",
    notes: "",
  };

  function effectiveTheme() {
    if (themeMode !== "system") return themeMode;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    const eff = effectiveTheme();
    document.documentElement.setAttribute("data-theme", eff);
    document.documentElement.setAttribute("data-theme-mode", themeMode);
    localStorage.setItem("prismnext-theme", themeMode);

    const meta = document.getElementById("theme-color");
    if (meta) meta.setAttribute("content", eff === "dark" ? "#060709" : "#ddd5c2");

    const icon = document.getElementById("wordmark-icon");
    if (icon) {
      const next =
        eff === "dark"
          ? icon.getAttribute("data-icon-dark")
          : icon.getAttribute("data-icon-light");
      if (next && icon.getAttribute("src") !== next) icon.src = next;
    }

    const activeIcon =
      themeMode === "light"
        ? ".theme-icon--sun"
        : themeMode === "dark"
          ? ".theme-icon--moon"
          : ".theme-icon--system";
    document.querySelectorAll(".theme-cycle").forEach((btn) => {
      btn.querySelectorAll(".theme-icon").forEach((el) => {
        el.style.display = el.matches(activeIcon) ? "" : "none";
      });
      const t = STRINGS[lang];
      const modeLabel =
        themeMode === "light"
          ? t.themeModeLight
          : themeMode === "dark"
            ? t.themeModeDark
            : t.themeModeSystem;
      btn.title = `${t.themeGroup}: ${modeLabel}`;
      btn.setAttribute("aria-label", btn.title);
    });

    themePreview?.onThemeChange(eff);
  }

  function applyI18n() {
    const t = STRINGS[lang];
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    const page = document.documentElement.getAttribute("data-page");
    const pageTitle = {
      privacy: t.titlePrivacy,
      terms: t.titleTerms,
      notices: t.titleNotices,
      security: t.titleSecurity,
      notfound: t.titleNotFound,
    };
    document.title = (page && pageTitle[page]) || t.title;

    document.querySelectorAll("[data-legal-lang]").forEach((el) => {
      const want = lang === "zh" ? "zh" : "en";
      el.hidden = el.getAttribute("data-legal-lang") !== want;
    });

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key && t[key] != null) el.textContent = t[key];
    });

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      const active = btn.getAttribute("data-lang") === lang;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const themeCycle = document.querySelector(".theme-cycle");
    if (themeCycle) {
      const modeLabel =
        themeMode === "light"
          ? t.themeModeLight
          : themeMode === "dark"
            ? t.themeModeDark
            : t.themeModeSystem;
      themeCycle.title = `${t.themeGroup}: ${modeLabel}`;
      themeCycle.setAttribute("aria-label", themeCycle.title);
    }
    const backdropToggle = document.querySelector(".backdrop-menu-toggle");
    if (backdropToggle) {
      backdropToggle.title = t.backdropMenuLabel;
      backdropToggle.setAttribute("aria-label", t.backdropMenuLabel);
    }
    const langGroup = document.querySelector(".lang");
    if (langGroup) langGroup.setAttribute("aria-label", t.langGroup);
    document.querySelectorAll(".downloads").forEach((el) => {
      el.setAttribute("aria-label", t.downloadsLabel);
    });

    wireDownloads();
  }

  function wireDownloads() {
    const t = STRINGS[lang];
    const urls = {
      mac: release.macUrl || "#",
      win: release.winUrl || "#",
      linux: release.linuxUrl || "#",
    };
    const platform = detectPlatform();
    const primary = platform === "win" ? "win" : platform === "linux" ? "linux" : "mac";

    document.querySelectorAll(".dl[data-platform]").forEach((el) => {
      const key = el.getAttribute("data-platform");
      if (!key || !(key in urls)) return;
      el.href = urls[key];
      el.classList.toggle("is-primary", key === primary);
      const os = el.querySelector(".dl-os");
      const fmt = el.querySelector(".dl-fmt");
      if (os) {
        if (key === "mac") os.textContent = t.osMac;
        if (key === "win") os.textContent = t.osWin;
        if (key === "linux") os.textContent = t.osLinux;
      }
      if (fmt) {
        if (key === "mac") fmt.textContent = t.fmtMac;
        if (key === "win") fmt.textContent = t.fmtWin;
        if (key === "linux") fmt.textContent = t.fmtLinux;
      }
    });
  }

  function setVersion(text) {
    document.querySelectorAll(".version").forEach((el) => {
      el.textContent = text;
    });
  }

  function setupScrollReveal() {
    const nodes = document.querySelectorAll(".reveal-on-scroll");
    if (!nodes.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    nodes.forEach((el) => io.observe(el));
  }

  /* Highlight the nav link for the section currently in view. */
  function setupScrollSpy() {
    const nav = document.querySelector(".head-nav");
    if (!nav) return;
    const links = [...nav.querySelectorAll('a[href^="#"]')];
    const bySection = new Map();
    links.forEach((a) => {
      const sec = document.querySelector(a.getAttribute("href"));
      if (sec) bySection.set(sec, a);
    });
    if (!bySection.size) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const active = bySection.get(entry.target);
          links.forEach((l) => l.classList.toggle("is-current", l === active));
        });
      },
      { rootMargin: "-25% 0px -65% 0px" },
    );

    bySection.forEach((_, sec) => io.observe(sec));
  }

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-lang");
      if (next !== "en" && next !== "zh") return;
      lang = next;
      localStorage.setItem("prismnext-lang", lang);
      applyI18n();
    });
  });

  document.querySelectorAll(".theme-cycle").forEach((btn) => {
    btn.addEventListener("click", () => {
      themeMode = themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light";
      applyTheme();
    });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themeMode !== "system") return;
    applyTheme();
  });

  async function boot() {
    if (window.PrismThemePreview) {
      themePreview = window.PrismThemePreview.init(() => effectiveTheme());
    }

    applyTheme();
    setVersion(defaultVersion());
    applyI18n();
    setupScrollReveal();
    setupScrollSpy();

    if (document.documentElement.getAttribute("data-page")) return;

    try {
      const v = await loadVersionJson();
      release = {
        version: v.version || defaultVersion(),
        macUrl: v.macUrl || "#",
        winUrl: v.winUrl || "#",
        linuxUrl: v.linuxUrl || "#",
        notes: v.notes || "",
      };
      setVersion(release.version);
      const notesEl = document.getElementById("notes");
      if (notesEl) notesEl.textContent = release.notes;
      wireDownloads();
    } catch (_) {
      const notesEl = document.getElementById("notes");
      if (notesEl) notesEl.textContent = STRINGS[lang].metaUnavailable;
    }
  }

  boot();
})();
