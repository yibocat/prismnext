(() => {
  const STRINGS = {
    en: {
      title: "PrismNext — Download",
      eyebrow: "Early Access",
      lede: "Co-driven AI science — gated, rigorous, complete.",
      sub: "From hypothesis to manuscript: ideation · literature · experiment · writing — one local Agent workspace.",
      versionLabel: "Version",
      pillars: "Local-first · Bring your own API key",
      foot: "Apache-2.0 · Local-first collaborative AI Scientist",
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
      loopKicker: "The loop",
      loopTitle: "One workspace from hypothesis to manuscript",
      loopLede:
        "Ideation, literature, experiments, and writing stay in the same local Agent surface — not four disconnected tools.",
      loopIdeation: "Ideation",
      loopLiterature: "Literature",
      loopExperiment: "Experiment",
      loopWriting: "Writing",
      capsKicker: "Capabilities",
      capsTitle: "Built for serious research work",
      capAgentTitle: "Agent chat with gates",
      capAgentText:
        "Local Agent sessions with permission gates — you keep control over tools, files, and what runs.",
      capLitTitle: "Literature library",
      capLitText:
        "Ingest papers, search your collection, and cite into writing without leaving the workspace.",
      capTexTitle: "LaTeX workspace",
      capTexText:
        "Edit, compile, and preview PDF in one place — SyncTeX-ready academic writing.",
      capExpTitle: "Experiments workbench",
      capExpText:
        "Track experiment files, runs, and results beside chat — overview, execution, and outcomes in one panel.",
      principlesKicker: "Principles",
      principlesTitle: "Local-first by design",
      pLocalTitle: "Local-first",
      pLocalText: "Your projects stay on your machine.",
      pKeyTitle: "Bring your key",
      pKeyText: "Use your own model API keys.",
      pOpenTitle: "Apache-2.0",
      pOpenText: "Open source collaborative AI Scientist.",
    },
    zh: {
      title: "PrismNext — 下载",
      eyebrow: "Early Access",
      lede: "AI 共驾科研 — 有闸门，有严谨，闭环一体。",
      sub: "从假设到成文：构思 · 文献 · 实验 · 撰写 — 本地 Agent 一站完成。",
      versionLabel: "版本",
      pillars: "本地优先 · 自备 API Key",
      foot: "Apache-2.0 · 本地优先的协作式 AI Scientist",
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
      loopKicker: "闭环",
      loopTitle: "从假设到成文，同一工作区",
      loopLede: "构思、文献、实验、撰写留在同一个本地 Agent 界面里——不是四个割裂的工具。",
      loopIdeation: "构思",
      loopLiterature: "文献",
      loopExperiment: "实验",
      loopWriting: "撰写",
      capsKicker: "能力",
      capsTitle: "为严肃科研工作而建",
      capAgentTitle: "有闸门的 Agent 聊天",
      capAgentText: "本地 Agent 会话 + 权限闸门——工具、文件与执行仍由你掌控。",
      capLitTitle: "文献库",
      capLitText: "入库、检索，并直接引用进写作，无需离开工作区。",
      capTexTitle: "LaTeX 工作区",
      capTexText: "编辑、编译、PDF 预览一体——面向学术写作的 SyncTeX 体验。",
      capExpTitle: "Experiments 工作台",
      capExpText: "实验文件、运行与结果与聊天并列——概览、执行、结果同屏。",
      principlesKicker: "原则",
      principlesTitle: "本地优先，写进产品",
      pLocalTitle: "本地优先",
      pLocalText: "项目数据留在你的机器上。",
      pKeyTitle: "自备 Key",
      pKeyText: "使用你自己的模型 API Key。",
      pOpenTitle: "Apache-2.0",
      pOpenText: "开源的协作式 AI Scientist。",
    },
  };

  function detectLang() {
    const saved = localStorage.getItem("prismnext-lang");
    if (saved === "en" || saved === "zh") return saved;
    const nav = (navigator.language || "en").toLowerCase();
    return nav.startsWith("zh") ? "zh" : "en";
  }

  function detectTheme() {
    const saved = localStorage.getItem("prismnext-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/Windows/i.test(ua) || /Win/i.test(platform)) return "win";
    // Android UA contains "Linux" — exclude before Linux desktop match.
    if (/Android/i.test(ua)) return "other";
    if (/Linux/i.test(ua) || /Linux/i.test(platform)) return "linux";
    if (/Mac|iPhone|iPad|iPod/i.test(ua) || /Mac/i.test(platform)) return "mac";
    return "other";
  }

  function defaultVersion() {
    return (
      document.querySelector('meta[name="prismnext-version"]')?.content || "0.0.0-dev"
    );
  }

  function versionJsonUrls() {
    const base = window.__RELEASES_BASE__;
    const isPlaceholder =
      !base || String(base).includes("REPLACE_WITH_R2_PUBLIC_BASE_URL");
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
  let theme = detectTheme();
  let release = {
    version: defaultVersion(),
    macUrl: "#",
    winUrl: "#",
    linuxUrl: "#",
    notes: "",
  };

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("prismnext-theme", theme);

    const meta = document.getElementById("theme-color");
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0a0e13" : "#eef2f6");

    document.querySelectorAll(".theme-btn").forEach((btn) => {
      const active = btn.getAttribute("data-theme-set") === theme;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const icon = document.getElementById("wordmark-icon");
    if (icon) {
      const next =
        theme === "dark"
          ? icon.getAttribute("data-icon-dark")
          : icon.getAttribute("data-icon-light");
      if (next && icon.getAttribute("src") !== next) icon.src = next;
    }
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

    const themeGroup = document.querySelector(".theme-toggle");
    if (themeGroup) themeGroup.setAttribute("aria-label", t.themeGroup);
    const langGroup = document.querySelector(".lang");
    if (langGroup) langGroup.setAttribute("aria-label", t.langGroup);
    document.querySelectorAll(".downloads").forEach((el) => {
      el.setAttribute("aria-label", t.downloadsLabel);
    });

    const shot = document.getElementById("product-shot");
    if (shot) {
      const next =
        lang === "zh"
          ? shot.getAttribute("data-shot-zh")
          : shot.getAttribute("data-shot-en");
      if (next && shot.getAttribute("src") !== next) shot.src = next;
      shot.alt =
        lang === "zh" ? "PrismNext 工作区截图" : "PrismNext workspace screenshot";
    }

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
    const primary =
      platform === "win" ? "win" : platform === "linux" ? "linux" : "mac";

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
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    nodes.forEach((el) => io.observe(el));
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

  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-theme-set");
      if (next !== "light" && next !== "dark") return;
      theme = next;
      applyTheme();
    });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (localStorage.getItem("prismnext-theme")) return;
    theme = e.matches ? "dark" : "light";
    applyTheme();
  });

  async function boot() {
    applyTheme();
    setVersion(defaultVersion());
    applyI18n();
    setupScrollReveal();

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
