/**
 * Theme packs (exact oklch values from src/renderer/lib/theme/theme-packs.ts)
 * + shot switcher (pack × light/dark) + compare wipe + live backdrop chips.
 */
(() => {
  const PACKS = [
    { id: "academic", label: "Academic" },
    { id: "midnight", label: "Midnight" },
    { id: "forest", label: "Forest" },
    { id: "warm-paper", label: "Warm Paper" },
    { id: "graphite", label: "Graphite" },
  ];

  /** accent = the pack's --primary; accentHot = its companion hue. */
  const PACK_CSS = {
    academic: {
      light: {
        accent: "oklch(0.50 0.16 255)",
        accentHot: "oklch(0.52 0.13 75)",
        glow: "oklch(0.50 0.16 255 / 0.14)",
        dot: "oklch(0.50 0.16 255)",
      },
      dark: {
        accent: "oklch(0.70 0.13 255)",
        accentHot: "oklch(0.74 0.11 75)",
        glow: "oklch(0.70 0.13 255 / 0.16)",
        dot: "oklch(0.70 0.13 255)",
      },
    },
    midnight: {
      light: {
        accent: "oklch(0.48 0.18 295)",
        accentHot: "oklch(0.52 0.14 190)",
        glow: "oklch(0.48 0.18 295 / 0.14)",
        dot: "oklch(0.48 0.18 295)",
      },
      dark: {
        accent: "oklch(0.72 0.13 295)",
        accentHot: "oklch(0.74 0.11 190)",
        glow: "oklch(0.72 0.13 295 / 0.16)",
        dot: "oklch(0.72 0.13 295)",
      },
    },
    forest: {
      light: {
        accent: "oklch(0.45 0.14 155)",
        accentHot: "oklch(0.52 0.13 90)",
        glow: "oklch(0.45 0.14 155 / 0.14)",
        dot: "oklch(0.45 0.14 155)",
      },
      dark: {
        accent: "oklch(0.72 0.11 155)",
        accentHot: "oklch(0.72 0.11 90)",
        glow: "oklch(0.72 0.11 155 / 0.16)",
        dot: "oklch(0.72 0.11 155)",
      },
    },
    "warm-paper": {
      light: {
        accent: "oklch(0.52 0.14 40)",
        accentHot: "oklch(0.50 0.13 185)",
        glow: "oklch(0.52 0.14 40 / 0.14)",
        dot: "oklch(0.52 0.14 40)",
      },
      dark: {
        accent: "oklch(0.74 0.11 40)",
        accentHot: "oklch(0.72 0.10 185)",
        glow: "oklch(0.74 0.11 40 / 0.16)",
        dot: "oklch(0.74 0.11 40)",
      },
    },
    graphite: {
      light: {
        accent: "oklch(0.28 0 0)",
        accentHot: "oklch(0.18 0 0)",
        glow: "oklch(0.28 0 0 / 0.12)",
        dot: "oklch(0.28 0 0)",
      },
      dark: {
        accent: "oklch(0.88 0 0)",
        accentHot: "oklch(0.96 0 0)",
        glow: "oklch(0.88 0 0 / 0.12)",
        dot: "oklch(0.88 0 0)",
      },
    },
  };

  function detectPack() {
    const saved = localStorage.getItem("prismnext-pack");
    return PACK_CSS[saved] ? saved : "academic";
  }

  function detectBackdrop() {
    const saved = localStorage.getItem("prismnext-backdrop");
    return window.PrismBackdrops?.isValid(saved) ? saved : "ink";
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function applyPackCss(packId, theme) {
    const pack = PACK_CSS[packId] || PACK_CSS.academic;
    const vars = pack[theme] || pack.light;
    const root = document.documentElement;
    root.style.setProperty("--accent", vars.accent);
    root.style.setProperty("--accent-hot", vars.accentHot);
    root.style.setProperty("--glow", vars.glow);
    root.setAttribute("data-pack", packId);
  }

  /**
   * Every img[data-shot] follows the current pack; its mode is the page
   * theme unless data-shot-lock pins it ("light"/"dark" for the compare).
   * File stems drop the hyphen: warm-paper → warmpaper-light.jpg.
   */
  function updateShots(packId, theme) {
    const stem = packId === "warm-paper" ? "warmpaper" : packId;
    document.querySelectorAll("img[data-shot]").forEach((img) => {
      const type = img.getAttribute("data-shot");
      if (!type) return;
      const mode = img.getAttribute("data-shot-lock") || theme;
      const next = `./assets/shots/${type}/${stem}-${mode}.webp`;
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
    });
  }

  /** Topbar pack dots — one per pack, split light/dark swatch. */
  function setupPackPicker(getTheme, onChange) {
    const hosts = document.querySelectorAll("[data-pack-picker]");
    if (!hosts.length) return;

    let current = detectPack();

    function dotBackground(packId) {
      const p = PACK_CSS[packId];
      return `linear-gradient(135deg, ${p.light.dot} 50%, ${p.dark.dot} 50%)`;
    }

    function paint() {
      hosts.forEach((host) => {
        host.innerHTML = "";
        PACKS.forEach((pack) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pack-dot";
          btn.dataset.pack = pack.id;
          btn.title = pack.label;
          btn.setAttribute("aria-label", `${pack.label} theme pack`);
          btn.setAttribute("aria-pressed", pack.id === current ? "true" : "false");
          btn.style.setProperty("--dot", dotBackground(pack.id));
          if (pack.id === current) btn.classList.add("is-active");
          btn.addEventListener("click", () => {
            current = pack.id;
            localStorage.setItem("prismnext-pack", current);
            paint();
            onChange(current);
          });
          host.appendChild(btn);
        });
      });
    }

    paint();
    onChange(current);
  }

  /** Diagonal wipe: left = light (base), right = dark (overlay). */
  function setupCompare(root) {
    const overlay = root.querySelector(".compare-img--overlay");
    const handle = root.querySelector(".compare-handle");
    const range = root.querySelector(".compare-range");
    if (!overlay || !handle || !range) return;

    let ratio = Number(localStorage.getItem("prismnext-compare"));
    if (!Number.isFinite(ratio) || ratio < 0.15 || ratio > 0.85) ratio = 0.5;

    function render() {
      const pct = ratio * 100;
      overlay.style.clipPath = `inset(0 0 0 ${pct}%)`;
      handle.style.left = `${pct}%`;
      range.value = String(Math.round(pct));
      range.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    function setRatio(next) {
      ratio = clamp(next, 0.06, 0.94);
      localStorage.setItem("prismnext-compare", String(ratio));
      render();
    }

    range.addEventListener("input", () => setRatio(Number(range.value) / 100));

    let dragging = false;
    function onPointerDown(e) {
      dragging = true;
      root.classList.add("is-dragging");
      root.setPointerCapture(e.pointerId);
      onPointerMove(e);
    }
    function onPointerMove(e) {
      if (!dragging) return;
      const rect = root.getBoundingClientRect();
      setRatio((e.clientX - rect.left) / rect.width);
    }
    function onPointerUp(e) {
      dragging = false;
      root.classList.remove("is-dragging");
      try {
        root.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    render();
  }

  /** Backdrop dropdown in the topbar — remounts the live desk backdrop. */
  function setupBackdropPicker() {
    const panel = document.querySelector("[data-backdrop-menu]");
    const toggle = document.querySelector(".backdrop-menu-toggle");
    const deskHost = document.getElementById("desk-backdrop");
    if (!panel || !toggle || !window.PrismBackdrops) return;

    let current = detectBackdrop();

    function paintActive() {
      panel.querySelectorAll(".backdrop-item").forEach((el) => {
        const on = el.dataset.backdrop === current;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-checked", on ? "true" : "false");
      });
    }

    function mountCurrent() {
      window.PrismBackdrops.mount(deskHost, current);
      paintActive();
    }

    function closePanel() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }

    function openPanel() {
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (panel.hidden) openPanel();
      else closePanel();
    });
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !toggle.contains(e.target)) {
        closePanel();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    panel.innerHTML = "";
    window.PrismBackdrops.STYLES.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "backdrop-item";
      btn.dataset.backdrop = b.id;
      btn.dataset.i18n = b.labelKey;
      btn.textContent = b.id;
      btn.setAttribute("role", "menuitemradio");
      btn.setAttribute("aria-checked", "false");
      btn.addEventListener("click", () => {
        current = b.id;
        localStorage.setItem("prismnext-backdrop", current);
        mountCurrent();
        closePanel();
      });
      panel.appendChild(btn);
    });

    mountCurrent();
  }

  window.PrismThemePreview = {
    init(getTheme) {
      setupPackPicker(getTheme, (packId) => {
        applyPackCss(packId, getTheme());
        updateShots(packId, getTheme());
      });

      document.querySelectorAll("[data-theme-compare]").forEach((root) => setupCompare(root));

      setupBackdropPicker();

      return {
        onThemeChange(theme) {
          applyPackCss(detectPack(), theme);
          updateShots(detectPack(), theme);
        },
      };
    },
  };
})();
