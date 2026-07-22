(() => {
  const STRINGS = {
    en: {
      title: "PrismNext — Download",
      eyebrow: "Early Access",
      lede: "Your collaborative AI scientist — on your desk.",
      sub: "Literature · design · experiments · LaTeX — one local workspace. The agent can drive; you keep the gates.",
      versionLabel: "Version",
      pillars: "Local-first · BYOK",
      platforms: "macOS · Windows",
      foot: "Apache-2.0 · Not an unsupervised paper factory — serious co-driving, locally.",
      downloadMac: "Download for macOS",
      downloadWin: "Download for Windows",
      otherMac: "macOS",
      otherWin: "Windows",
      metaUnavailable: "Release metadata unavailable.",
    },
    zh: {
      title: "PrismNext — 下载",
      eyebrow: "Early Access",
      lede: "你的协作式 AI 科学家 — 就在桌面上。",
      sub: "文献 · 设计 · 实验 · LaTeX — 一个本地工作区。Agent 可驱动；闸门在你手里。",
      versionLabel: "版本",
      pillars: "本地优先 · BYOK",
      platforms: "macOS · Windows",
      foot: "Apache-2.0 · 不是无人发论文引擎 — 在本地做严肃共驾。",
      downloadMac: "下载 macOS 版",
      downloadWin: "下载 Windows 版",
      otherMac: "macOS",
      otherWin: "Windows",
      metaUnavailable: "暂时无法加载发布信息。",
    },
  };

  function detectLang() {
    const saved = localStorage.getItem("prismnext-lang");
    if (saved === "en" || saved === "zh") return saved;
    const nav = (navigator.language || "en").toLowerCase();
    return nav.startsWith("zh") ? "zh" : "en";
  }

  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/Windows/i.test(ua) || /Win/i.test(platform)) return "win";
    if (/Mac|iPhone|iPad|iPod/i.test(ua) || /Mac/i.test(platform)) return "mac";
    return "other";
  }

  function defaultVersion() {
    return (
      document.querySelector('meta[name="prismnext-version"]')?.content ||
      "0.0.0-dev"
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
  let release = {
    version: defaultVersion(),
    macUrl: "#",
    winUrl: "#",
    notes: "",
  };

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

    wireDownloads();
  }

  function wireDownloads() {
    const t = STRINGS[lang];
    const primary = document.getElementById("dl-primary");
    const secondary = document.getElementById("dl-secondary");
    if (!primary || !secondary) return;

    const platform = detectPlatform();
    const preferWin = platform === "win";

    if (preferWin) {
      primary.href = release.winUrl || "#";
      primary.textContent = t.downloadWin;
      secondary.href = release.macUrl || "#";
      secondary.textContent = t.otherMac;
    } else {
      primary.href = release.macUrl || "#";
      primary.textContent = t.downloadMac;
      secondary.href = release.winUrl || "#";
      secondary.textContent = t.otherWin;
    }
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

  async function boot() {
    document.getElementById("version").textContent = defaultVersion();
    applyI18n();

    try {
      const v = await loadVersionJson();
      release = {
        version: v.version || defaultVersion(),
        macUrl: v.macUrl || "#",
        winUrl: v.winUrl || "#",
        notes: v.notes || "",
      };
      document.getElementById("version").textContent = release.version;
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
