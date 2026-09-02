(() => {
  const STRINGS = {
    en: {
      title: "PrismNext — the AI agent research workbench",
      eyebrow: "Early Access",
      navDownload: "Download",
      navChangelog: "Changelog",
      navPricing: "Pricing",
      navAbout: "About",
      heroTitle1: "Your AI research team,",
      heroTitle2: "on one desk.",
      heroSub:
        "PrismNext is an all-around AI-agent research collaboration app. Let the agent run the full research loop autonomously — read, think, experiment, write, review — or work side by side as your copilot. Multi-project workbench, literature, experiments, Git, LaTeX & Typst. Local-first, on your desk.",
      heroDownload: "Download",
      heroStar: "Star on GitHub",
      loopKicker: "§1 — The AI research loop",
      loopCaption: "review feeds the next pass — you stay in the loop",
      shotHomeCap: "Chat with your team — the agent works across the whole desk",
      shotLitCap: "Papers found mid-chat land in the side panel — one click to shelf them",
      shotWriteCap: "Real-time preview — write in Typst or LaTeX, alone or with the agent",
      shotTeamCap: "Team settings — inspect the Lead, subagents, and skills; fully customizable",
      shotSkillsCap: "Every skill at a glance — protocols, templates, and checks",
      shotComposerCap: "An in-paper composer — let the agent revise the manuscript directly",
      shotReadCap: "Reading companion — the paper and its co-pilot, side by side",
      obIdeate: "Ideate",
      obIdeateSub: "Brainstorm · hypothesis cards · idea ledger",
      obRead: "Read",
      obReadSub: "Library · Zotero · MinerU · web",
      obThink: "Think",
      obThinkSub: "Notes · critique · derivations",
      obDesign: "Design",
      obDesignSub: "Brief · interactive Plan gates",
      obRun: "Run",
      obRunSub: "Gated experiments · provenance",
      obWrite: "Write",
      obWriteSub: "LaTeX · Typst · Proposed Changes",
      obReview: "Review",
      obReviewSub: "Diffs · gates · human veto",
      loopFigNote: "Every beat is a conversation: hand the loop to the agent, or steer it beat by beat.",
      statTeams: "Teams in Core + Pro",
      statSkills: "Built-in research skills",
      statPillars: "Engineering pillars",
      statDesk: "Desk for every paper",
      archKicker: "§2 — Architecture",
      howKicker: "§3 — How it works",
      howTitle: "From a spark to a manuscript",
      howLede:
        "Research is more than plan-run-check. The desk carries the whole journey — and every stage is a conversation you can steer or hand over.",
      howSpark: "Spark the idea",
      howSparkText:
        "Brainstorm with a dedicated debate team, capture ideas in a durable ledger, and stress-test hypotheses before committing compute.",
      howGround: "Ground it in literature",
      howGroundText:
        "The agents read what matters — papers, data, methods — and synthesize what is known, contested, and missing.",
      howWork: "Design, run, verify",
      howWorkText:
        "Experiment matrices go through Plan and permission gates; runs are monitored live and receipted. Results are checked against the method before write-up.",
      howWrite: "Write it up",
      howWriteText:
        "LaTeX or Typst with live preview, citation-checked references, and every agent edit arriving as a reviewable diff.",
      coversTitle: "Beyond the loop",
      coversLede:
        "Switching the team switches the working mode. Beyond the core loop, specialist teams sit on the desk for the parts of research most tools ignore.",
      covTeamsTitle: "One desk, many modes",
      covTeamsText:
        "Teams v2 is the signature: switching the team switches how the agent thinks and works — one Lead voice, delegated specialists, 30 built-in skills, MCP tools. Fully autonomous or shoulder-to-shoulder, your call.",
      covIdeaTitle: "Idea Arena & Topic Brainstorm",
      covIdeaText:
        "Structured multi-agent debate — steel-man, devil's advocate, pragmatist — turns a vague interest into testable hypothesis cards, with a documented kill list.",
      covLedgerTitle: "Idea Ledger",
      covLedgerText:
        "A durable account of closed ideas, why they were closed, and what would reopen them — so the team never re-litigates a dead end.",
      covCrossTitle: "Translation Table",
      covCrossText:
        "Cross-disciplinary comparison: two fields assess the same claim, a translator aligns terminology, and a judge rules on feasibility and novelty asymmetry.",
      covCareerTitle: "Milestone Coach & Committee",
      covCareerText:
        "Multi-year program coaching, portfolio audits against promotion standards, and a demanding mock committee with a recovery roadmap.",
      covClaimTitle: "Claim Police",
      covClaimText:
        "A claim–evidence–hedge audit that flags statements outrunning the data — verification only, it never rewrites your manuscript.",
      skillsKicker: "§4 — Skills",
      proKicker: "§5 — Pro Teams",
      principlesKicker: "§6 — Non-negotiables",
      downloadTitle: "Free. On every desktop.",
      downloadSub: "One installer per platform. Free core loop out of the box.",
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
      loopTitle: "One agent, the whole research loop",
      loopLede:
        "Reading, thinking, experimenting, and writing are one continuous workflow — the agent can drive the entire loop autonomously, or step in only where you ask.",
      loopIdeation: "Ideation & Plan",
      loopIdeationDef: "Problem formulation, Brief, and interactive Plan (⌥P) approval gates.",
      loopLiterature: "Literature",
      loopLiteratureDef: "SQLite library, Zotero sync, MinerU parsing, and continuous citation auditing.",
      loopExperiment: "Experiment",
      loopExperimentDef: "Gated execution with a live Job Monitor; every run leaves a Methods-grade provenance receipt.",
      loopWriting: "Writing",
      loopWritingDef: "First-class LaTeX & Typst, Tectonic / Tinymist compilation, and Proposed Changes merge diffs.",
      figManifold: "The research manifold — drag to rotate; the surface is live.",
      mn2: "read → design → run → write",
      archTitle: "Built on five pillars",
      archLede:
        "An AI-agent application is only as trustworthy as the ground it stands on — five pillars carry every autonomous and collaborative workflow.",
      archWorkbench: "Multi-Project Workbench",
      archWorkbenchDef:
        "Several paper folders stay open on one desk — each with its own chats, file tree, library slot, and modes. Switching focus changes the center and right panels without killing background agents.",
      archStorage: "Local-First Storage Boundary",
      archStorageDef:
        "Your manuscript lives in the project Git tree. Structured metadata — agent instructions, compile cache, experiments, teams — lives in .workbench/. Cross-project state — chat sessions, per-project libraries, agent worktree checkouts, skills, and teams — lives in ~/.prismnext/. File watchers stay locked to authorized roots.",
      archPi: "Embedded Pi Agent + Teams v2",
      archPiDef:
        "Chat runs on a research-enhanced Pi host in the main process. Teams v2 staffs the desk: one Lead voice, Task-delegated specialists, skills, slash commands, and team MCP servers. PermissionGate keeps consequential tools behind explicit Allow / Deny cards.",
      archJobs: "End-to-End AI Research Loop",
      archJobsDef:
        "Read papers, question and critique, design and run experiments, then write — one continuous chain. Every experiment is gated by Plans and permission modes, monitored live, and receipted (command, exit code, duration, outputs) into runs.jsonl, so any claim in Methods can be traced to the run that produced it.",
      archRemote: "Remote Research over SSH",
      archRemoteDef:
        "Connect to a lab machine from ~/.ssh/config. The Host runtime installs itself; chat, files, literature, compile, and long-running experiments execute on the server while your laptop stays the control desk. Model keys are sealed with AES-256-GCM and the unwrap key never leaves this computer.",
      mn8: "several papers, one desk →",
      newTitle: "What's new in 0.9",
      newLede:
        "The 0.9 line reshaped the desk: Typst beside LaTeX, document reading in chat, live web search, and a full remote workspace over plain SSH.",
      newAnydocTitle: "Read Office & PDF in chat",
      newAnydocText:
        "Attach Word, PowerPoint, Excel, or EPUB files and the agent reads them locally via AnyDoc — no API key. Composer files become inline chips instead of Markdown dumps.",
      newWebTitle: "Web search & fetch",
      newWebText:
        "The agent can search the public web and read a page with your own Tavily key — for docs, datasets, and APIs, not just papers.",
      newFoldTitle: "Worked-for folds",
      newFoldText:
        "Thinking, tool calls, and in-between notes fold away as the answer lands — chat reads like a log you can skim, ending on the final reply.",
      newTypstTitle: "Typst, first-class",
      newTypstText:
        "Open a .typ and Tinymist live-previews it in the pane — locally or on a remote Host. Compile to PDF, export, and cite against the same .bib.",
      newRemoteTitle: "Remote workspace over SSH",
      newRemoteText:
        "Connect to a lab machine from ~/.ssh/config. The Host runtime installs itself; chat, files, literature, compile, and experiments run on the server. Keys are sealed with AES-256-GCM.",
      newLaptopTitle: "Your laptop stays first-class",
      newLaptopText:
        "Remote sessions keep an offline laptop copy; cold start reads it without SSH. Remote TeX pauses auto-compile per folder. Worktrees and Plan drafts live on the Host.",
      skillsTitle: "30 built-in research skills",
      skillsText:
        "30 bundled scientific skills in PrismNext Core — each complete with formal protocol tables, LaTeX/Typst templates, and verification scripts.",
      skillTierDesign: "Ideate, design & run · 7",
      skillTierWriting: "Writing · 7",
      skillTierFigures: "Figures · 6",
      skillTierReview: "Reading & review · 5",
      skillTierMeta: "Math & meta · 5",
      skTypstFigure: "Copy a CeTZ / fletcher catalog template, edit contract labels, and compile a standalone figure.",
      skNameTypst: "Typst figures",
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
      principlesTitle: "Non-negotiables",
      principlesLede:
        "These are not features — they are the ground rules the product is built on. Every capability, autonomous or assisted, stays inside them.",
      pLocalTitle: "Locality",
      pLocalText: "Your projects stay strictly on your local machine.",
      pPrivacyTitle: "Privacy",
      pPrivacyText:
        "No product telemetry or analytics. We do not collect usage data or operate a PrismNext cloud.",
      pKeyTitle: "Keys",
      pKeyText: "Model calls route directly to providers using your own API keys — no Prism cloud, no middleman.",
      pVetoTitle: "Veto",
      pVetoText: "Every automated move is gated and auditable; the researcher retains absolute veto power.",
      refsTitle: "References",
      refSource: "PrismNext source code",
      refReleases: "PrismNext releases",
      refGithub: "Author's GitHub",
      refEmail: "Contact",
      foot: "The all-around AI-agent research collaboration app — autonomous loop or copilot, your call. Local-first, on your desk.",
      footProduct: "Product",
      footProject: "Project",
      footLegal: "Legal",
      chlogKicker: "Release notes",
      chlogTitle: "Changelog",
      chlogLede:
        "Every user-facing change, newest first — mirrored from the project's changelog.",
      chlogUnreleased: "Unreleased",
      aboutKicker: "About",
      aboutTitle: "About PrismNext",
      aboutComing:
        "This page is on its way — it will tell the story of PrismNext, the team behind it, and where the product is heading.",
      aboutMeanwhile:
        "Meanwhile, the homepage walks through what PrismNext does, and the changelog tracks every release.",
      aboutBack: "Back to home",
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
      title: "PrismNext — AI Agent 科研协作工作台",
      eyebrow: "抢先体验",
      navDownload: "下载",
      navChangelog: "更新日志",
      navPricing: "价格",
      pricingKicker: "价格",
      pricingTitle: "价格",
      pricingComing:
        "详细方案正在路上。开源核心始终免费；Pro 专科团队在本地激活，抢先体验期间免费开放。",
      navAbout: "关于",
      heroTitle1: "你的 AI 科研团队，",
      heroTitle2: "就在一张书桌上。",
      heroSub:
        "PrismNext 是一个全方位的 AI Agent 科研协作应用：既能让 Agent 自主跑通完整的科研闭环——读文献、思考、批判、做实验、写作、审阅——也能作为科研副驾与你协作推进。多项目工作台、文献、实验、Git、LaTeX 与 Typst，本地优先，就在你的书桌上。",
      heroDownload: "下载",
      heroStar: "GitHub 点星",
      loopKicker: "§1 — AI 科研闭环",
      loopCaption: "审阅回流，再来一轮——你始终在环里",
      shotHomeCap: "与团队对话——Agent 调动整张书桌",
      shotLitCap: "对话中检索到的论文进入侧栏，一键入库",
      shotWriteCap: "实时预览——Typst 或 LaTeX，自己写或让 Agent 写",
      shotTeamCap: "团队设置——查看主 Agent、Subagent 与技能，高度自定义",
      shotSkillsCap: "所有技能一览——协议、模板与检查",
      shotComposerCap: "论文内 Composer——直接让 Agent 修改手稿",
      shotReadCap: "论文伴读——手稿与副驾并排而立",
      obIdeate: "构思",
      obIdeateSub: "脑暴 · 假说卡片 · 想法账本",
      obRead: "阅读",
      obReadSub: "文献库 · Zotero · MinerU · 联网",
      obThink: "思考",
      obThinkSub: "笔记 · 批判 · 推导验证",
      obDesign: "设计",
      obDesignSub: "Brief · 交互式 Plan 闸门",
      obRun: "运行",
      obRunSub: "带闸门的实验 · 全程溯源",
      obWrite: "写作",
      obWriteSub: "LaTeX · Typst · Proposed Changes",
      obReview: "审阅",
      obReviewSub: "差异对比 · 闸门 · 人类否决",
      loopFigNote: "每一拍都是一场对话：既可整环交给 Agent，也可逐拍亲自掌舵。",
      statTeams: "Core + Pro 团队",
      statSkills: "内置科研技能",
      statPillars: "工程支柱",
      statDesk: "一张书桌装下所有论文",
      archKicker: "§2 — 系统架构",
      howKicker: "§3 — 如何运转",
      howTitle: "从一个火花，到一篇论文",
      howLede:
        "科研不只是「规划—执行—检验」。这张书桌承载完整的旅程——每一站既可由你主导，也可以交给团队。",
      howSpark: "点燃想法",
      howSparkText:
        "与专门的论辩团队脑暴，把想法记入持久账本，在投入算力之前先对假说做压力测试。",
      howGround: "扎进文献",
      howGroundText:
        "Agent 精读真正要紧的论文、数据与方法，综合出「哪些已知、哪些有争议、哪些仍缺失」。",
      howWork: "设计、运行、检验",
      howWorkText:
        "实验矩阵经 Plan 与权限闸门放行；运行全程实时监视并留下收据。成文之前，结果先对照方法逐项复核。",
      howWrite: "落笔成文",
      howWriteText:
        "LaTeX 或 Typst 实时预览，引用逐条核验，Agent 的每处修改都以可审阅的 diff 呈现。",
      coversTitle: "闭环之外",
      coversLede:
        "切换团队，就是切换工作模式。核心闭环之外，还有一支支专科团队坐镇书桌，覆盖多数工具顾不到的科研环节。",
      covTeamsTitle: "一张书桌，多种模式",
      covTeamsText:
        "Teams v2 是招牌：切换团队即切换 Agent 的思考与工作方式——一位 Lead 发声、专科专家被委派、30 项内置技能与 MCP 工具随行。完全自主，或并肩协作，由你决定。",
      covIdeaTitle: "想法论辩场 & 选题脑暴",
      covIdeaText:
        "结构化多智能体论辩——正方、反方、务实派——把模糊兴趣打磨成可检验的假说卡片，并留下有据可查的淘汰清单。",
      covLedgerTitle: "想法账本",
      covLedgerText:
        "持久记录已关闭的想法、关闭原因与重新开启的条件——团队不会在死胡同上反复空转。",
      covCrossTitle: "跨学科对照台",
      covCrossText:
        "两个学科分别审视同一主张，译者对齐术语，再由裁判判断可行性与「在一方平凡、在另一方新颖」的不对称。",
      covCareerTitle: "里程碑教练 & 答辩委员会",
      covCareerText:
        "多年期研究计划教练、对照晋升标准的成果组合审计，以及一场严苛的模拟答辩与恢复路线图。",
      covClaimTitle: "主张核验",
      covClaimText:
        "「主张—证据—限定语」审计，标出超出数据支撑的表述——只核验，绝不代写你的手稿。",
      skillsKicker: "§4 — 内置技能",
      proKicker: "§5 — Pro 团队",
      principlesKicker: "§6 — 不可妥协的底线",
      downloadTitle: "免费，全平台可用。",
      downloadSub: "每个平台一份安装包，免费核心开箱即用。",
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
      loopTitle: "一个 Agent，跑通整个科研闭环",
      loopLede: "阅读、思考、实验、写作是一条连续的工作流——Agent 既可以自主跑通全流程，也可以只在你需要处插手协助。",
      loopIdeation: "构思与规划",
      loopIdeationDef: "问题提炼、Research Brief 与交互式 Plan（⌥P）审批闸门。",
      loopLiterature: "文献库",
      loopLiteratureDef: "SQLite 本地文献库、Zotero 双向同步、MinerU 解析与持续引用审计。",
      loopExperiment: "实验",
      loopExperimentDef: "带闸门的执行与实时 Job Monitor；每次运行都留下 Methods 级溯源收据。",
      loopWriting: "写作",
      loopWritingDef: "原生 LaTeX 与 Typst、Tectonic / Tinymist 编译，以及 Proposed Changes 差异审阅。",
      figManifold: "科研流形——拖拽旋转，曲面是实时渲染的。",
      mn2: "读 → 设计 → 跑 → 写",
      archTitle: "五大工程支柱",
      archLede: "AI Agent 应用值不值得信任，取决于它脚下的地基——每一条自主或协作的工作流都站在这五根支柱上。",
      archWorkbench: "多项目 Workbench",
      archWorkbenchDef:
        "多张论文文件夹同时驻留于同一书桌——各自拥有独立的对话、文件树、文献槽位与模式面板。切换焦点时，中心区与右侧面板随之切换，后台 Agent 不被终止。",
      archStorage: "本地优先存储边界",
      archStorageDef:
        "手稿位于项目 Git 树。结构化元数据——Agent 说明、编译缓存、实验、团队——存于 .workbench/。跨项目状态——对话会话、按项目文献库、Agent worktree 签出、技能与团队——存于 ~/.prismnext/。文件监听严格锁定于授权根目录。",
      archPi: "嵌入式 Pi Agent + Teams v2",
      archPiDef:
        "Chat 由主进程内的科研增强型 Pi 宿主驱动。Teams v2 坐镇书桌：单一 Lead 对话声线、Task 委派专科、技能、斜杠命令与团队 MCP。PermissionGate 将高风险工具置于显式 Allow / Deny 卡片之后。",
      archJobs: "端到端 AI 科研闭环",
      archJobsDef:
        "读论文、提问与批判、设计并运行实验、再落笔成文——一条连续的链路。每个实验都经 Plan 与权限模式闸门、可实时监视，并把回执（命令、退出码、时长、产物）固化到 runs.jsonl，Methods 里的每个结论都能回溯到产生它的那次运行。",
      archRemote: "SSH 远程科研",
      archRemoteDef:
        "从 ~/.ssh/config 直连实验室机器。Host 运行时自动装机；聊天、文件、文献、编译与长时实验都在服务器上执行，笔记本只是控制台。模型密钥以 AES-256-GCM 密封，解钥永不离开这台电脑。",
      mn8: "多篇论文，一张书桌 →",
      newTitle: "0.9 更新速览",
      newLede:
        "0.9 系列重塑了这张书桌：Typst 与 LaTeX 并列、聊天直读 Office 文档、可联网检索，以及基于纯 SSH 的完整远程工作区。",
      newAnydocTitle: "聊天直读 Office 与 PDF",
      newAnydocText:
        "拖入 Word、PowerPoint、Excel 或 EPUB，Agent 经 AnyDoc 本地转换——无需 API Key。附件在输入框中是内联文件 chip，而不是整段 Markdown 倾倒。",
      newWebTitle: "联网检索与网页阅读",
      newWebText:
        "Agent 可用你自己的 Tavily Key 搜索公网并读取页面——面向文档、数据集与 API，而不只是论文。",
      newFoldTitle: "Worked for 折叠",
      newFoldText:
        "思考、工具调用与中间备注随答案落地自动折叠——聊天读起来像一份可快速浏览的执行日志，以终稿收尾。",
      newTypstTitle: "Typst 一等公民",
      newTypstText:
        "打开 .typ 即由 Tinymist 实时预览——本机与远程 Host 皆可。可编译 PDF、导出，并与 LaTeX 共用同一份 .bib 引用。",
      newRemoteTitle: "基于 SSH 的远程工作区",
      newRemoteText:
        "从 ~/.ssh/config 直连实验室机器。Host 运行时自动装机；聊天、文件、文献、编译与实验都在服务器上执行。模型密钥以 AES-256-GCM 密封存放。",
      newLaptopTitle: "笔记本始终是一等公民",
      newLaptopText:
        "远程会话在本机保留离线副本，冷启动无需 SSH 即可阅读。远程 TeX 按文件夹记忆自动编译开关。Worktree 与 Plan 草稿留在 Host。",
      skillsTitle: "30 项内置科研技能",
      skillsText:
        "PrismNext Core 团队预置 30 项严密的科研技能——每项技能均配备标准协议表、LaTeX/Typst 模板与可执行验证脚本。技能归属于 Team，由当前允许名单自动加载。",
      skillTierDesign: "构想、设计与运行 · 7",
      skillTierWriting: "学术写作 · 7",
      skillTierFigures: "图表绘制 · 6",
      skillTierReview: "阅读与评审 · 5",
      skillTierMeta: "数学与元能力 · 5",
      skTypstFigure: "复制 CeTZ / fletcher 目录模板，修改契约标签后编译独立图形。",
      skNameTypst: "Typst 绘图",
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
      principlesTitle: "不可妥协的底线",
      principlesLede:
        "这些不是功能，而是产品赖以构建的底线规则。无论自主还是辅助，所有能力都在这条线之内运行。",
      pLocalTitle: "本地性",
      pLocalText: "所有科研项目数据、手稿与数据库严格保留在你的本地机器上。",
      pPrivacyTitle: "隐私",
      pPrivacyText: "无产品遥测、无行为分析。我们不收集使用数据，也不运营 PrismNext 云。",
      pKeyTitle: "密钥",
      pKeyText: "模型调用走你自己的 API Key 与你信赖的供应商——无中转代理，绝无 Prism 云端。",
      pVetoTitle: "终审否决",
      pVetoText: "所有自动化操作均受闸门约束且完全可审计；研究人员始终享有最终绝对否决权。",
      refsTitle: "参考文献与链接",
      refSource: "PrismNext 开源仓库",
      refReleases: "PrismNext 发布版本",
      refGithub: "作者 GitHub",
      refEmail: "联系邮箱",
      foot: "全方位的 AI Agent 科研协作应用——自主闭环或副驾协作，由你决定。本地优先，就在你的书桌上。",
      footProduct: "产品",
      footProject: "项目",
      footLegal: "法律",
      chlogKicker: "版本发布",
      chlogTitle: "更新日志",
      chlogLede: "所有面向用户的变更，从新到旧——与项目 changelog 同步。",
      chlogUnreleased: "未发布",
      aboutKicker: "关于",
      aboutTitle: "关于 PrismNext",
      aboutComing:
        "这个页面正在路上——它将讲述 PrismNext 的故事、背后的团队，以及产品的方向。",
      aboutMeanwhile: "在此之前，首页介绍了 PrismNext 能做什么，更新日志记录了每个版本的变更。",
      aboutBack: "返回首页",
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
    updateThemeShots(eff);
  }

  /* Every img.theme-shot follows the page theme: shots3/<name>-<mode>.webp */
  function updateThemeShots(mode) {
    document.querySelectorAll("img.theme-shot[data-shot]").forEach((img) => {
      const name = img.getAttribute("data-shot");
      if (!name) return;
      const next = `./assets/shots3/${name}-${mode}.webp`;
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
    });
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

    applyTheme();
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
    const nodes = document.querySelectorAll(".reveal");
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
    const nav = document.querySelector(".topnav");
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

  /* ═══ Motion: topbar state, hero parallax, loop diagram, stat counters ═══ */

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setupTopbarState() {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    const onScroll = () => bar.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function setupHeroParallax() {
    if (reducedMotion) return;
    const grid = document.querySelector(".hero-grid");
    if (!grid || window.matchMedia("(pointer: coarse)").matches) return;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = null;
    function tick() {
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      grid.style.transform = `translate(${curX.toFixed(2)}px, ${curY.toFixed(2)}px)`;
      if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    }
    window.addEventListener("pointermove", (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      targetX = nx * -18;
      targetY = ny * -12;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }

  /* Orbit loop: a glowing agent particle travels a ring of seven beats.
     Beats live as HTML beside the canvas and light up as the particle passes. */
  function setupOrbitLoop() {
    const stage = document.querySelector("[data-orbit]");
    const canvas = document.getElementById("orbit-canvas");
    if (!stage || !canvas) return;
    const beats = Array.from(stage.querySelectorAll(".orbit-beat"));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const BEATS = beats.length || 7;

    function palette() {
      const css = getComputedStyle(document.documentElement);
      return {
        accent: css.getPropertyValue("--accent").trim() || "#e06450",
        brass: css.getPropertyValue("--brass").trim() || "#c9a24f",
        line: css.getPropertyValue("--line-strong").trim() || "#39404d",
        faint: css.getPropertyValue("--ink-faint").trim() || "#6f6a5d",
        soft: css.getPropertyValue("--ink-soft").trim() || "#a8a294",
      };
    }

    let pal = palette();

    function sizeCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Active-beat highlight sync (HTML side).
    let activeBeat = -1;
    function setActive(i) {
      if (i === activeBeat) return;
      activeBeat = i;
      beats.forEach((el, k) => el.classList.toggle("is-active", k === i));
    }

    if (reducedMotion) {
      // Static final state: full ring, every beat lit.
      setActive(BEATS - 1);
      beats.forEach((el) => el.classList.add("is-active"));
      return;
    }

    let running = false;
    let visible = true;
    let angle = -Math.PI / 2; // start at top
    const SPEED = 0.36; // radians per second — one lap ≈ 17.5s

    function draw() {
      const w = canvas.getBoundingClientRect().width;
      const h = w; // square
      const cx = w / 2;
      const cy = h / 2;
      const R = w * 0.365;

      ctx.clearRect(0, 0, w, h);

      // faint dotted guide ring
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.setLineDash([2, 7]);
      ctx.strokeStyle = pal.line;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // beat nodes on the ring
      for (let i = 0; i < BEATS; i++) {
        const a = -Math.PI / 2 + (i / BEATS) * Math.PI * 2;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const lit = i === activeBeat;
        ctx.beginPath();
        ctx.arc(x, y, lit ? 7 : 4, 0, Math.PI * 2);
        ctx.fillStyle = lit ? pal.accent : pal.soft;
        ctx.globalAlpha = lit ? 1 : 0.55;
        ctx.fill();
        if (lit) {
          // halo
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.strokeStyle = pal.accent;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // traveled arc
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, angle);
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // particle with comet tail
      const px = cx + Math.cos(angle) * R;
      const py = cy + Math.sin(angle) * R;
      const TAIL = 10;
      for (let k = TAIL; k >= 1; k--) {
        const a = angle - k * 0.035;
        const tx = cx + Math.cos(a) * R;
        const ty = cy + Math.sin(a) * R;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.2 * (1 - k / (TAIL + 1)), 0, Math.PI * 2);
        ctx.fillStyle = pal.accent;
        ctx.globalAlpha = 0.28 * (1 - k / (TAIL + 1));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // glow
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 18);
      grad.addColorStop(0, pal.accent);
      grad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px, py, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = pal.accent;
      ctx.fill();

      // which beat does the particle face? (0 = top, clockwise)
      const norm = (angle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      const beatIdx = Math.round((norm / (Math.PI * 2)) * BEATS) % BEATS;
      setActive(beatIdx);
    }

    let last = performance.now();
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible) {
        angle += SPEED * dt;
        draw();
      }
      requestAnimationFrame(frame);
    }

    sizeCanvas();
    draw();
    const ro = new ResizeObserver(() => {
      sizeCanvas();
      draw();
    });
    ro.observe(canvas);

    // Pause when offscreen.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
          if (visible) last = performance.now();
        });
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    running = true;
    requestAnimationFrame(frame);
  }

  /* Stat counters: count up once, when the row enters the viewport. */
  function setupStatCounters() {
    const nums = document.querySelectorAll(".stat-num[data-count]");
    if (!nums.length) return;
    if (reducedMotion) {
      nums.forEach((el) => (el.textContent = el.getAttribute("data-count")));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          io.unobserve(el);
          const target = Number(el.getAttribute("data-count")) || 0;
          const dur = 1100;
          const t0 = performance.now();
          function frame(now) {
            const t = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(target * eased));
            if (t < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
      },
      { threshold: 0.6 },
    );
    nums.forEach((el) => io.observe(el));
  }

  async function boot() {
    if (window.PrismThemePreview) {
      themePreview = window.PrismThemePreview.init(() => effectiveTheme());
    }

    applyTheme();
    setVersion(defaultVersion());
    applyI18n();
    setupScrollReveal();
    setupScrollSpy();
    setupTopbarState();
    setupHeroParallax();
    setupOrbitLoop();
    setupStatCounters();

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
