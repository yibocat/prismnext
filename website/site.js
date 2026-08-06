(() => {
  const STRINGS = {
    en: {
      title: "PrismNext — a local-first AI scientist",
      eyebrow: "Early Access",
      navLoop: "§1 Loop",
      navCaps: "§2 Capabilities",
      navAxioms: "§3 Axioms",
      navRefs: "References",
      pubMeta: "Preprint",
      versionLabel: "Version",
      authors: "An integrated AI scientist on your desk — far more than a LaTeX editor.",
      abstractTitle: "Abstract",
      abstractText:
        "PrismNext is an integrated research environment, not another editor: a literature library with citation health, Zotero sync, and MinerU parsing; gated experiment runs; notes, git versioning, and first-class LaTeX — one enhanced opencode agent across reading, coding, and writing that can co-drive a study or close the loop autonomously. Local-first, free, and private — nothing leaves your machine; models run on your own keys.",
      keywordsLabel: "Keywords",
      keywords:
        "local-first · literature · experiments · notes · git · LaTeX · Zotero & MinerU · multi-provider · gated agent",
      pillars: "Local-first · Free & open source · Bring your own API key · No data collection",
      mn1: "co-drive, not autopilot →",
      loopTitle: "The research loop",
      loopLede:
        "Ideation, literature, experiments, and writing share one local Agent surface — an enhanced opencode agent, not four disconnected tools.",
      loopIdeation: "Ideation",
      loopIdeationDef: "Problem and path, captured in Brief and Plan.",
      loopLiterature: "Literature",
      loopLiteratureDef: "A project shelf with citation health — not chat attachments.",
      loopExperiment: "Experiment",
      loopExperimentDef: "Runs, logs, and provenance for Methods.",
      loopWriting: "Writing",
      loopWritingDef: "TeX workspace, live PDF, Proposed Changes review.",
      figManifold: "The research manifold — drag to rotate; the surface is live.",
      mn2: "read → design → run → write",
      showcaseTitle: "Capabilities",
      showcaseLede:
        "Evidence over adjectives — nine surfaces that ship today, each wearing the theme pack and desk backdrop you pick in the header.",
      shotHomeTitle: "One prompt box, the whole desk",
      shotHomeText:
        "A new Agent session starts here: pick a model, an expert, and skills, then aim the same composer at a literature hunt, an experiment run, or a manuscript.",
      figHome: "The session composer — model, expert, and skills at hand. Drag for light vs dark.",
      shotLitTitle: "Literature, searched and shelved",
      shotLitText:
        "The agent hunts across sources and stages what it finds — Pending vs In library is explicit, Zotero syncs in, MinerU parses the PDFs. Papers live in the project, not in chat attachments.",
      figLit: "Search results with their shelf status, one click from the library.",
      shotReadTitle: "Reading with a co-pilot",
      shotReadText:
        "The PDF sits on one side, the agent on the other. Ask about a section, a figure, or a claim — answers cite the page you are looking at.",
      figRead: "The paper and its reading companion, side by side.",
      shotIntensiveTitle: "Intensive reading, line by line",
      shotIntensiveText:
        "Lasso a formula, a figure, or a paragraph and the agent walks through it step by step — notation unpacked, derivation explained, assumptions named.",
      figIntensive: "A lassoed formula, explained line by line.",
      shotNotesTitle: "Notes that write back",
      shotNotesText:
        "Derivations, reading cards, and half-ideas live in project notes — and the agent works inside them: expanding, organizing, and cross-linking as you think.",
      figNotes: "Notes on the left, the agent expanding them on the right.",
      shotExpTitle: "Experiments with provenance",
      shotExpText:
        "The same agent writes the script, runs it gated, and files the receipt — command, exit code, runtime, run id, output, artifacts. Methods-grade traceability by default.",
      figExp: "A finished run with its full receipt.",
      shotGitTitle: "Git, built into the workspace",
      shotGitText:
        "Every step — agent-written or yours — lands in git. Side-by-side diffs, commits, and reverts without leaving the desk; the whole research trail stays diffable.",
      figGit: "The day's work as a side-by-side diff, ready to commit.",
      shotWritingTitle: "First-class LaTeX writing",
      shotWritingText:
        "A real TeX workbench: source with an outline sidebar, live PDF preview, bundled Tectonic compile, and Proposed Changes review — serious manuscript editing, not a Markdown sidebar.",
      figWriting: "Source, outline, and the freshly compiled PDF.",
      shotModelsTitle: "Every provider, your keys",
      shotModelsText:
        "DeepSeek, Claude, Gemini, GPT, Grok, Kimi, Qwen, MiMo, MiniMax — switch models mid-task, all on your own API keys. No Prism cloud, no middleman.",
      figModels: "The model picker — every major provider under your keys.",
      shotAgentTitle: "Interactive research, with a human gate",
      shotAgentText:
        "The agent proposes, you dispose: plans ask for consent, large moves come with auditable diffs, and permission modes decide how far autonomy goes — co-drive when you want control, full loop when you don't.",
      figAgent: "A working session — the agent acts, you review every large move.",
      skillsTitle: "Research standards, codified",
      skillsText:
        "25 bundled skills the agent is held to — each with reference tables, templates, and runnable scripts. Always-on discipline lives in the prompt layer; skills load on demand. Open format: plug in community sources or distill your own from practice.",
      skillTierDesign: "Ideate, design & run · 7",
      skillTierWriting: "Writing · 7",
      skillTierFigures: "Figures · 4",
      skillTierReview: "Reading & review · 5",
      skillTierMeta: "Math & meta · 2",
      skIdeaLab: "Brainstorm boldly — divergence before judgment, sparks filed in a dedicated ideas/ folder.",
      skRelatedWork: "Library → synthesis narrative, grounded citations.",
      skReadingNotes: "Structured deep-read notes from PDFs.",
      skHypothesis: "Sharpen a question into testable hypotheses.",
      skDesignMatrix: "Fix the factorial / ablation matrix — and the compute budget — before running.",
      skToMethods: "Run records become Methods prose — no invented numbers.",
      skFigurePipeline: "Data → figure → manuscript, end to end.",
      skCriticalReview: "Reverse-angle pass over manuscripts, claims, decisions — and itself.",
      skRebuttal: "Point-by-point reviewer rebuttal drafting.",
      skPreflight: "Pass/fail gate before sharing: compile, citations, desk-reject.",
      skStatRigor: "Test selection, effect sizes, runnable power analysis.",
      skPrisma: "PRISMA 2020 protocol, screening log, flow counts.",
      skSciVis: "Colorblind-safe matplotlib style + chart selection.",
      skSymMath: "SymPy-verified derivations, straight to LaTeX.",
      skTikz: "TikZ/pgfplots templates that compile out of the box.",
      skInteraction: "RightArea figure & plot objects, conventions included.",
      skMlProtocol: "Multi-seed discipline, fair baselines, aggregation script.",
      skMgmtSci: "DiD/IV/RDD, behavioral experiments, robustness battery.",
      skSkillCreator: "Distill skills from workflows that just worked.",
      skWritingDesign: "Outline gate before prose: story, sections, promise map.",
      skIntro: "Problem-driven, contribution-first, or story-arc — patterns, not molds.",
      skPrelims: "Notation tables, problem setup, symbol consistency.",
      skMethodsCh: "Motivation-driven structure; experiment receipts welcome.",
      skResults: "Numbers carry run ids; negative results reported.",
      skConclusion: "Closes the Introduction's questions; honest limitations.",
      skNameWritingDesign: "Writing design",      skNameIntro: "Introduction",
      skNamePrelims: "Preliminaries",
      skNameMethodsCh: "Methods chapter",
      skNameResults: "Results",
      skNameConclusion: "Conclusion",
      skNameIdeaLab: "Idea lab",
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
      skNameSympy: "Symbolic math",
      skNameTikz: "TikZ & pgfplots",
      skNamePanel: "Panel figures",
      skNameMl: "ML experiment protocol",
      skNameMgmt: "Management & decision science",
      skNameCreator: "Skill creator",
      mn3: "all local — check .prismnext/",
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
      pLocalText: "Your projects stay on your machine.",
      pPrivacyTitle: "Axiom 2 (Privacy).",
      pPrivacyText: "No telemetry, no analytics, no data collection — nothing leaves the machine.",
      pKeyTitle: "Axiom 3 (Keys).",
      pKeyText: "Model calls go through your own API keys — any provider, no Prism cloud.",
      pVetoTitle: "Axiom 4 (Veto).",
      pVetoText: "Every automated move is gated and auditable; you keep the veto.",
      refsTitle: "References",
      refSource: "PrismNext source code",
      refReleases: "PrismNext releases",
      refGithub: "Author's GitHub",
      refEmail: "Contact",
      foot: "Local-first collaborative AI Scientist — set in Instrument Serif, Sora & Plex Mono.",
      footFine: "© 2026 yibocat · No trackers, no accounts — nothing leaves the machine.",
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
      title: "PrismNext — 本地优先的 AI 科学家",
      eyebrow: "Early Access",
      navLoop: "§1 闭环",
      navCaps: "§2 能力",
      navAxioms: "§3 公理",
      navRefs: "参考文献",
      pubMeta: "预印本",
      versionLabel: "版本",
      authors: "你书桌上的集成式 AI 科学家——远不止一个 LaTeX 编辑器。",
      abstractTitle: "摘要",
      abstractText:
        "PrismNext 是一套集成式科研环境，不是又一个编辑器：带引用健康检查、Zotero 同步与 MinerU 解析的文献库，有闸门的实验运行，笔记、git 版本管理与一等公民的 LaTeX——由同一个增强 opencode Agent 贯穿阅读、编码与写作，既能协助你推进，也能全自动闭环。本地优先、免费、注重隐私：数据不出本机，模型走你自己的 Key。",
      keywordsLabel: "关键词",
      keywords: "本地优先 · 文献 · 实验 · 笔记 · git · LaTeX · Zotero 与 MinerU · 多供应商 · 有闸门的 Agent",
      pillars: "本地优先 · 免费开源 · 自备 API Key · 不收集数据",
      mn1: "共驾，不是自动驾驶 →",
      loopTitle: "科研闭环",
      loopLede: "构思、文献、实验、撰写留在同一个本地 Agent 界面里——一个增强的 opencode Agent，而不是四个割裂的工具。",
      loopIdeation: "构思",
      loopIdeationDef: "问题与路径，写进 Brief 与 Plan。",
      loopLiterature: "文献",
      loopLiteratureDef: "项目书架，带引用健康检查——不是聊天附件。",
      loopExperiment: "实验",
      loopExperimentDef: "运行、日志与 Methods 溯源。",
      loopWriting: "撰写",
      loopWritingDef: "TeX 工作区、实时 PDF、Proposed Changes 审阅。",
      figManifold: "科研流形——拖拽旋转，曲面是实时渲染的。",
      mn2: "读 → 设计 → 跑 → 写",
      showcaseTitle: "能力一览",
      showcaseLede: "证据胜于形容词——以下九个界面今天就能用，每张截图都穿着你在顶栏选的主题包，背景样式也在顶栏换。",
      shotHomeTitle: "一个输入框，调动整张书桌",
      shotHomeText: "新的 Agent 会话从这里开始：选好模型、专家与技能，然后用同一个输入框发起文献检索、实验运行或手稿撰写。",
      figHome: "会话 Composer——模型、专家与技能随取。拖动对比亮与暗。",
      shotLitTitle: "文献，检索即入库",
      shotLitText: "Agent 跨源检索并把结果分门别类——Pending 与 In library 一目了然；Zotero 同步进来，MinerU 解析全文。论文留在项目里，不是聊天附件。",
      figLit: "检索结果带着书架状态，一键收进文献库。",
      shotReadTitle: "伴读，不是孤读",
      shotReadText: "PDF 在一侧，Agent 在另一侧。问一个章节、一张图、一个论断——答案会引用你正看着的那一页。",
      figRead: "论文与伴读 Agent，并排而立。",
      shotIntensiveTitle: "精读，逐行拆解",
      shotIntensiveText: "框选公式、图表或段落，Agent 逐步讲解——记号拆开、推导讲透、假设点名。",
      figIntensive: "被框选的公式，逐行讲给你听。",
      shotNotesTitle: "会回写的笔记",
      shotNotesText: "推导、阅读卡片与半成品想法都住在项目笔记里——Agent 就在笔记中工作：扩写、整理、互链，跟着你的思路走。",
      figNotes: "左侧是笔记，右侧 Agent 正在扩写。",
      shotExpTitle: "实验，全程留痕",
      shotExpText: "同一个 Agent 写脚本、过闸门运行，并把回执归档——命令、退出码、运行时长、run id、输出与 artifacts。默认就是 Methods 级别的溯源。",
      figExp: "一次完成的运行及其完整回执。",
      shotGitTitle: "工作区自带 git",
      shotGitText: "每一步——无论 Agent 写的还是你写的——都进入 git。side-by-side diff、提交与回滚都不用离开书桌；整条科研轨迹随时可比对。",
      figGit: "当天的工作变成并排 diff，随时可以提交。",
      shotWritingTitle: "一等公民的 LaTeX 写作",
      shotWritingText: "真正的 TeX 工作台：源码配目录侧栏、实时 PDF 预览、内置 Tectonic 编译，外加 Proposed Changes 审阅——严肃手稿编辑，不是 Markdown 侧边栏。",
      figWriting: "源码、目录与刚编译好的 PDF。",
      shotModelsTitle: "所有供应商，用你的 Key",
      shotModelsText: "DeepSeek、Claude、Gemini、GPT、Grok、Kimi、Qwen、MiMo、MiniMax——任务途中随时换模型，全部走你自己的 API Key。没有 Prism 云，没有中间商。",
      figModels: "模型选择器——主流供应商尽在你的 Key 之下。",
      shotAgentTitle: "交互式科研，人守着闸门",
      shotAgentText: "Agent 提案、你拍板：Plan 需要同意，大动作给出可审计的 diff，权限模式决定自主权放多大——想掌控就共驾，想放手就全自动闭环。",
      figAgent: "一次工作会话——Agent 行动，每个大动作由你过目。",
      skillsTitle: "内置的科研规范",
      skillsText:
        "Agent 须遵守的 25 个内置技能——每个都配参考表、模板与可运行脚本。每轮必守的纪律在常开 prompt 层，技能按需加载。格式开放：可接社区技能源，也可把刚走通的流程蒸馏成你自己的。",
      skillTierDesign: "构想、设计与运行 · 7",
      skillTierWriting: "写作 · 7",
      skillTierFigures: "图表 · 4",
      skillTierReview: "阅读与评审 · 5",
      skillTierMeta: "数学与元 · 2",
      skIdeaLab: "大胆头脑风暴——先发散后评判，火花收进专用 ideas/ 文件夹。",
      skRelatedWork: "文献库 → 综述叙事，引用皆有出处。",
      skReadingNotes: "从 PDF 产出结构化精读笔记。",
      skHypothesis: "把问题磨成可检验的假设。",
      skDesignMatrix: "跑实验前先定全因子 / 消融矩阵——连算力预算一起定。",
      skToMethods: "运行记录变成 Methods 正文——不编造数字。",
      skFigurePipeline: "数据 → 图 → 手稿，端到端。",
      skCriticalReview: "对手稿、主张、决策——也包括它自己——做反向角度深审。",
      skRebuttal: "逐点回复审稿意见。",
      skPreflight: "分享/投稿前总闸门：编译、引用、desk-reject。",
      skStatRigor: "检验选择、效应量、可运行的功效分析。",
      skPrisma: "PRISMA 2020 协议、筛选日志、流程计数。",
      skSciVis: "色盲安全 matplotlib 样式 + 选图指南。",
      skSymMath: "SymPy 验证的符号推导，直达 LaTeX。",
      skTikz: "开箱即可编译的 TikZ/pgfplots 模板。",
      skInteraction: "RightArea 图与绘图对象的完整约定。",
      skMlProtocol: "多种子纪律、公平基线、聚合脚本。",
      skMgmtSci: "DiD/IV/RDD、行为实验、稳健性组合拳。",
      skSkillCreator: "把刚刚走通的工作流蒸馏成技能。",
      skWritingDesign: "动笔前的大纲闸门：故事线、章节、承诺映射。",
      skIntro: "问题驱动 / 贡献优先 / 故事弧线——模板是参照，不是模具。",
      skPrelims: "记号表、问题设定、符号一致性。",
      skMethodsCh: "动机驱动的结构；欢迎实验收据。",
      skResults: "数字带 run id；阴性结果也报告。",
      skConclusion: "回收 Introduction 的问题；诚实的局限。",
      skNameIdeaLab: "想法实验室",
      skNameWritingDesign: "写作设计",
      skNameIntro: "Introduction",
      skNamePrelims: "预备知识",
      skNameMethodsCh: "方法论章节",
      skNameResults: "结果",
      skNameConclusion: "结论",
      skNameRelated: "相关工作",
      skNameNotes: "精读笔记",
      skNameHypothesis: "假设设计",
      skNameMatrix: "实验设计矩阵",
      skNameMethods: "实验日志成文",
      skNameFigure: "图表流水线",
      skNameReview: "批判性深审",
      skNameRebuttal: "审稿回复",
      skNamePreflight: "手稿预检闸门",
      skNameStats: "统计严谨",
      skNamePrisma: "PRISMA 系统综述",
      skNameVis: "Matplotlib 绘图",
      skNameSympy: "符号推导",
      skNameTikz: "TikZ 图形模板",
      skNamePanel: "面板图规范",
      skNameMl: "ML 实验协议",
      skNameMgmt: "管理与决策科学",
      skNameCreator: "技能创作",
      mn3: "全部本地——看看 .prismnext/",
      mn5: "欢迎 star 与 fork →",
      mn6: "截图跟着主题换装 →",
      mn7: "条条都能跑，不是口号 ↓",
      compareLight: "浅色",
      compareDark: "深色",
      backdropMenuLabel: "背景样式",
      backdropInk: "墨迹草稿",
      backdropAcademic: "学术水印",
      backdropOrigami: "随意涂画",
      backdropRain: "夜雨",
      backdropForest: "飘落树叶",
      backdropBlueprint: "蓝图线稿",
      backdropStarfield: "晴空夜空",
      backdropCircuit: "电路排线",
      backdropBookshelf: "书架",
      backdropClips: "回形针与书签",
      backdropPaperplane: "纸飞机",
      backdropStamp: "草稿印章",
      backdropPendulum: "钟摆",
      backdropConstellation: "星座连线",
      themeModeLight: "浅色",
      themeModeDark: "深色",
      themeModeSystem: "跟随系统",
      principlesTitle: "公理",
      pLocalTitle: "公理 1（本地性）。",
      pLocalText: "项目数据留在你的机器上。",
      pPrivacyTitle: "公理 2（隐私）。",
      pPrivacyText: "无遥测、无分析、不收集数据——没有任何东西离开你的机器。",
      pKeyTitle: "公理 3（密钥）。",
      pKeyText: "模型调用走你自己的 API Key——任意供应商，没有 Prism 云。",
      pVetoTitle: "公理 4（否决）。",
      pVetoText: "每个自动化动作都有闸门、可审计；你始终保留否决权。",
      refsTitle: "参考文献",
      refSource: "PrismNext 源代码",
      refReleases: "PrismNext 发布页",
      refGithub: "作者 GitHub",
      refEmail: "联系邮箱",
      foot: "本地优先的协作式 AI Scientist —— 排版于 Instrument Serif、Sora 与 Plex Mono。",
      footFine: "© 2026 yibocat · 无追踪、无账号——一切留在本机。",
      osMac: "macOS",
      osWin: "Windows",
      osLinux: "Linux",
      fmtMac: ".dmg",
      fmtWin: ".exe",
      fmtLinux: "AppImage",
      metaUnavailable: "暂时无法加载发布信息。",
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
    return [`${normalized}/version.json`, "./version.json"];
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
    document.title = t.title;

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
