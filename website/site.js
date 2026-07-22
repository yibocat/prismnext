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
    // Android UA contains "Linux" — exclude before Linux desktop match.
    if (/Android/i.test(ua)) return "other";
    if (/Linux/i.test(ua) || /Linux/i.test(platform)) return "linux";
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
    linuxUrl: "#",
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
    const mac = document.getElementById("dl-mac");
    const win = document.getElementById("dl-win");
    const linux = document.getElementById("dl-linux");
    if (!mac || !win || !linux) return;

    mac.href = release.macUrl || "#";
    win.href = release.winUrl || "#";
    linux.href = release.linuxUrl || "#";

    mac.querySelector(".dl-os").textContent = t.osMac;
    win.querySelector(".dl-os").textContent = t.osWin;
    linux.querySelector(".dl-os").textContent = t.osLinux;
    mac.querySelector(".dl-fmt").textContent = t.fmtMac;
    win.querySelector(".dl-fmt").textContent = t.fmtWin;
    linux.querySelector(".dl-fmt").textContent = t.fmtLinux;

    const platform = detectPlatform();
    [mac, win, linux].forEach((el) => el.classList.remove("is-primary"));
    if (platform === "win") win.classList.add("is-primary");
    else if (platform === "linux") linux.classList.add("is-primary");
    else mac.classList.add("is-primary");
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
        linuxUrl: v.linuxUrl || "#",
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
