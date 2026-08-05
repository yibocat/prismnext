/**
 * Desk backdrops — 1:1 ports of the app's chat-home backdrops
 * (src/renderer/lib/chat/home-backdrops/). Fourteen styles share one host;
 * mount(host, styleId) swaps them live.
 */
(() => {
  const MASK =
    "radial-gradient(ellipse 76% 62% at 50% 46%, #000 16%, transparent 78%)";
  const HAND_FONTS =
    '"Segoe Print", "Bradley Hand", "Apple Chancery", "Marker Felt", Noteworthy, "Comic Sans MS", cursive, serif';

  function createRng(seed) {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function prefersReducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function makeShell(host, styleId, { mask = true } = {}) {
    const shell = document.createElement("div");
    shell.className = `backdrop-shell backdrop-shell--${styleId}`;
    shell.setAttribute("aria-hidden", "true");
    if (mask) {
      shell.style.maskImage = MASK;
      shell.style.webkitMaskImage = MASK;
    }
    host.appendChild(shell);
    return shell;
  }

  function makeCanvas(shell) {
    const canvas = document.createElement("canvas");
    canvas.className = "backdrop-canvas";
    canvas.setAttribute("aria-hidden", "true");
    shell.appendChild(canvas);
    return canvas;
  }

  /** Repaint when light/dark or the theme pack flips (colors are CSS vars). */
  function observeTheme(redraw) {
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-pack"],
    });
    return () => mo.disconnect();
  }

  /* ═══ ink — margin draft notes (website's tuned, unmasked variant) ═══ */

  const INK_LEFT = [
    "TODO: check refs",
    "§2.1 — rewrite?",
    "why this lemma?",
    "cf. Smith 2019",
    "delete paragraph",
    "α → β? no…",
    "margin note:",
    "git commit often",
    "expand later",
    "ask about proof",
    "???",
  ];

  const INK_RIGHT = [
    "Draft v0.3",
    "fix notation",
    "Eq. (4) unclear",
    "!!!",
    "ask coauthor",
    "bibliography…",
    "move to appendix",
    "runs/ → Methods",
    "ok for now",
    "see footnote",
    "rephrase",
  ];

  function drawHandLine(ctx, text, x0, y0, size, rot, color, alpha, rand) {
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.font = `${size}px ${HAND_FONTS}`;

    let x = 0;
    for (const ch of text) {
      const jx = (rand() - 0.5) * size * 0.18;
      const jy = (rand() - 0.5) * size * 0.28;
      const jr = (rand() - 0.5) * 0.12;
      const js = 0.88 + rand() * 0.28;

      ctx.save();
      ctx.translate(x + jx, jy);
      ctx.rotate(jr);
      ctx.scale(js, 0.92 + rand() * 0.2);
      ctx.globalAlpha = alpha * (0.75 + rand() * 0.25);
      ctx.fillText(ch, 0, 0);
      ctx.restore();

      x += ctx.measureText(ch).width * (0.9 + rand() * 0.22) + (rand() - 0.5) * 1.2;
    }
    ctx.restore();
  }

  function drawScribble(ctx, x, y, color, alpha, rand) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1 + rand() * 0.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    const len = 40 + rand() * 50;
    for (let i = 1; i <= 5; i++) {
      ctx.quadraticCurveTo(
        x + (i / 5) * len + (rand() - 0.5) * 18,
        y + (rand() - 0.5) * 28,
        x + ((i + 0.5) / 5) * len,
        y + Math.sin(i) * 10 + (rand() - 0.5) * 12,
      );
    }
    ctx.stroke();
  }

  function mountInk(host) {
    const shell = makeShell(host, "ink", { mask: false });
    const canvas = makeCanvas(shell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => shell.remove();

    function paint() {
      const LOGICAL_W = 1000;
      const LOGICAL_H = 700;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(LOGICAL_W * dpr);
      canvas.height = Math.floor(LOGICAL_H * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "cover";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const color = getComputedStyle(shell).color;
      const rand = createRng(0x696e6b31);
      ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      let y = 70;
      for (const line of INK_LEFT) {
        const size = 12 + rand() * 4;
        const rot = (rand() - 0.5) * 0.18;
        const x = 22 + rand() * 28;
        drawHandLine(ctx, line, x, y, size, rot, color, 0.72 + rand() * 0.22, rand);
        if (rand() > 0.55) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(x - 2, y - size * 0.35);
          ctx.lineTo(x + size * line.length * 0.48, y - size * 0.45);
          ctx.stroke();
        }
        if (rand() > 0.7) {
          drawScribble(ctx, x + 8, y + 14, color, 0.4 + rand() * 0.2, rand);
        }
        y += 48 + rand() * 28;
      }

      y = 60;
      for (const line of INK_RIGHT) {
        const size = 12 + rand() * 4;
        const rot = (rand() - 0.5) * 0.18;
        const x = 820 + rand() * 40;
        drawHandLine(ctx, line, x, y, size, rot, color, 0.7 + rand() * 0.22, rand);
        if (rand() > 0.6) {
          drawScribble(ctx, x + 10, y + 12, color, 0.38 + rand() * 0.2, rand);
        }
        y += 50 + rand() * 26;
      }

      ctx.globalAlpha = 1;
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(host);
    const off = observeTheme(paint);
    return () => {
      off();
      ro.disconnect();
      shell.remove();
    };
  }

  /* ═══ academic — faint STEM formulas & structures (inline SVG) ═══ */

  const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";
  const ACADEMIC_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <text x="72" y="108" fill="currentColor" font-size="28" font-family="${SERIF}" transform="rotate(-7 72 108)" opacity="0.82">∫ f(x) dx</text>
  <text x="760" y="92" fill="currentColor" font-size="16" font-family="${SERIF}" opacity="0.68">∮_C f(z) dz = 2πi Σ Res(f, zₖ)</text>
  <text x="200" y="598" fill="currentColor" font-size="26" font-family="${SERIF}" transform="rotate(6 200 598)" opacity="0.7">e^(iπ) + 1 = 0</text>
  <text x="300" y="200" fill="currentColor" font-size="36" font-family="${SERIF}" opacity="0.42">π</text>
  <text x="500" y="520" fill="currentColor" font-size="19" font-family="${SERIF}" transform="rotate(8 500 520)" opacity="0.46">sin²θ + cos²θ = 1</text>
  <text x="48" y="248" fill="currentColor" font-size="17" font-family="${SERIF}" opacity="0.52">∂²u/∂t² = c²∇²u</text>
  <text x="420" y="660" fill="currentColor" font-size="14" font-family="${SERIF}" transform="rotate(-3 420 660)" opacity="0.4">ℒ{f(t)} = ∫₀^∞ f(t)e^(−st) dt</text>
  <text x="700" y="168" fill="currentColor" font-size="30" font-family="${SERIF}" opacity="0.78">E = mc²</text>
  <text x="88" y="520" fill="currentColor" font-size="26" font-family="${SERIF}" opacity="0.65">F = ma</text>
  <text x="842" y="340" fill="currentColor" font-size="19" font-family="${SERIF}" opacity="0.62">∇·E = ρ/ε₀</text>
  <text x="260" y="88" fill="currentColor" font-size="17" font-family="${SERIF}" transform="rotate(-5 260 88)" opacity="0.58">iℏ ∂ψ/∂t = Ĥψ</text>
  <text x="140" y="450" fill="currentColor" font-size="16" font-family="${SERIF}" transform="rotate(7 140 450)" opacity="0.5">Δx · Δp ≥ ℏ/2</text>
  <text x="640" y="612" fill="currentColor" font-size="21" font-family="${SERIF}" transform="rotate(-5 640 612)" opacity="0.58">λ = h/p</text>
  <text x="860" y="548" fill="currentColor" font-size="27" font-family="${SERIF}" opacity="0.68">H₂O</text>
  <text x="420" y="88" fill="currentColor" font-size="22" font-family="${SERIF}" transform="rotate(5 420 88)" opacity="0.52">C₆H₁₂O₆</text>
  <text x="268" y="420" fill="currentColor" font-size="18" font-family="${SERIF}" transform="rotate(12 268 420)" opacity="0.4">PV = nRT</text>
  <text x="380" y="280" fill="currentColor" font-size="14" font-family="${SERIF}" transform="rotate(-14 380 280)" opacity="0.42">5′-ATCGGCTA-3′</text>
  <g transform="translate(820 400) rotate(16) scale(1.15)" opacity="0.55">
    <path d="M 0 0 Q 14 18 0 36 Q -14 54 0 72 Q 14 90 0 108 Q -14 126 0 144" stroke="currentColor" stroke-width="1" fill="none"/>
    <path d="M 28 0 Q 42 18 28 36 Q 14 54 28 72 Q 42 90 28 108 Q 14 126 28 144" stroke="currentColor" stroke-width="1" fill="none"/>
    <line x1="4" y1="18" x2="24" y2="18" stroke="currentColor" stroke-width="0.75"/>
    <line x1="4" y1="54" x2="24" y2="54" stroke="currentColor" stroke-width="0.75"/>
    <line x1="4" y1="90" x2="24" y2="90" stroke="currentColor" stroke-width="0.75"/>
    <line x1="4" y1="126" x2="24" y2="126" stroke="currentColor" stroke-width="0.75"/>
  </g>
  <g transform="translate(640 360) scale(1.45)" opacity="0.68">
    <line x1="0" y1="72" x2="148" y2="72" stroke="currentColor" stroke-width="1.1"/>
    <line x1="24" y1="96" x2="24" y2="0" stroke="currentColor" stroke-width="1.1"/>
    <path d="M 28 68 C 52 68, 60 12, 88 20 S 124 64, 140 44" stroke="currentColor" stroke-width="1.2" fill="none"/>
  </g>
  <g transform="translate(520 220) scale(0.62)" opacity="0.52">
    <line x1="0" y1="40" x2="120" y2="40" stroke="currentColor" stroke-width="0.9"/>
    <path d="M 0 40 Q 15 8, 30 40 T 60 40 T 90 40 T 120 40" stroke="currentColor" stroke-width="1" fill="none"/>
  </g>
  <g transform="translate(920 200) scale(1.35)" opacity="0.5">
    <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" stroke="currentColor" stroke-width="1" fill="none"/>
    <circle cx="0" cy="0" r="9" stroke="currentColor" stroke-width="0.9" fill="none"/>
  </g>
  <g transform="translate(300 560) scale(0.55)" opacity="0.48">
    <line x1="0" y1="40" x2="56" y2="40" stroke="currentColor" stroke-width="1"/>
    <line x1="0" y1="40" x2="0" y2="0" stroke="currentColor" stroke-width="1"/>
    <path d="M 48 40 L 56 40 L 52 36" stroke="currentColor" stroke-width="1" fill="none"/>
    <path d="M 0 8 L 0 0 L 4 4" stroke="currentColor" stroke-width="1" fill="none"/>
  </g>
  <g transform="translate(140 120) scale(1.05)" opacity="0.44">
    <line x1="0" y1="48" x2="88" y2="48" stroke="currentColor" stroke-width="0.9"/>
    <line x1="12" y1="56" x2="12" y2="4" stroke="currentColor" stroke-width="0.9"/>
    <path d="M 16 44 L 28 20 L 40 36 L 52 12 L 64 28 L 76 16" stroke="currentColor" stroke-width="1" fill="none"/>
  </g>
</svg>`;

  function mountAcademic(host) {
    const shell = makeShell(host, "academic");
    shell.innerHTML = ACADEMIC_SVG;
    return () => shell.remove();
  }

  /* ═══ paperplane — sketch planes gliding across the desk ═══ */

  function spawnPlane(w, h, fromLeft) {
    const size = 28 + Math.random() * 34;
    const speed = 28 + Math.random() * 22;
    const y = h * (0.12 + Math.random() * 0.55);
    if (fromLeft) {
      return {
        x: -size * 2,
        y,
        vx: speed,
        vy: (Math.random() - 0.45) * 8,
        size,
        rot: -0.22 + Math.random() * 0.12,
        bob: Math.random() * Math.PI * 2,
        bobAmp: 6 + Math.random() * 8,
        alpha: 0.35 + Math.random() * 0.3,
      };
    }
    return {
      x: w + size * 2,
      y,
      vx: -speed * 0.85,
      vy: (Math.random() - 0.55) * 7,
      size: size * 0.85,
      rot: 0.18 + Math.random() * 0.14,
      bob: Math.random() * Math.PI * 2,
      bobAmp: 5 + Math.random() * 7,
      alpha: 0.28 + Math.random() * 0.22,
    };
  }

  function drawPlane(ctx, p, color, t) {
    const bobY = Math.sin(t * 0.9 + p.bob) * p.bobAmp;
    ctx.save();
    ctx.translate(p.x, p.y + bobY);
    ctx.rotate(p.rot + Math.sin(t * 0.5 + p.bob) * 0.04);
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = p.alpha;
    ctx.lineWidth = 1.15;

    const s = p.size;
    const facing = p.vx >= 0 ? 1 : -1;
    ctx.scale(facing, 1);

    ctx.beginPath();
    ctx.moveTo(0, s * 0.22);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.72, s * 0.32);
    ctx.lineTo(s, s * 0.64);
    ctx.lineTo(0, s * 0.44);
    ctx.lineTo(s * 0.3, s * 0.32);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s * 0.3, s * 0.32);
    ctx.lineTo(s * 0.72, s * 0.32);
    ctx.globalAlpha = p.alpha * 0.75;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  function mountPaperplane(host) {
    const shell = makeShell(host, "paperplane");
    const canvas = makeCanvas(shell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => shell.remove();

    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let lastTime = performance.now();
    let planes = [];

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (reduced) {
        planes = [
          { ...spawnPlane(width, height, true), x: width * 0.18, y: height * 0.22 },
          { ...spawnPlane(width, height, false), x: width * 0.72, y: height * 0.48 },
          { ...spawnPlane(width, height, true), x: width * 0.28, y: height * 0.68, size: 26 },
        ];
      } else if (planes.length === 0) {
        planes = [
          spawnPlane(width, height, true),
          spawnPlane(width, height, false),
          spawnPlane(width, height, true),
        ];
        planes[0].x = width * 0.15;
        planes[1].x = width * 0.75;
        planes[2].x = width * 0.4;
        planes[2].y = height * 0.62;
        planes[2].size *= 0.7;
        planes[2].alpha *= 0.85;
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    let raf = 0;
    const draw = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(shell).color;

      for (const p of planes) {
        if (!reduced) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x > width + p.size * 3 || p.x < -p.size * 3) {
            Object.assign(p, spawnPlane(width, height, p.vx > 0));
          }
          if (p.y < -40 || p.y > height + 40) {
            p.y = Math.max(40, Math.min(height - 40, p.y));
            p.vy *= -0.6;
          }
        }
        drawPlane(ctx, p, color, t);
      }

      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    let off = null;
    if (reduced) {
      draw(performance.now());
      off = observeTheme(() => draw(performance.now()));
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off?.();
      shell.remove();
    };
  }

  /* ═══ forest — falling leaves with a slow pendulum sway ═══ */

  function createLeaf(w, h) {
    return {
      x: Math.random() * Math.max(w, 1),
      y: Math.random() * Math.max(h, 1),
      scale: 0.5 + Math.random() * 0.65,
      rotation: (Math.random() - 0.5) * 0.6,
      swayOmega: 0.45 + Math.random() * 0.35,
      swayAmp: 26 + Math.random() * 34,
      phase: Math.random() * Math.PI * 2,
      speed: 22 + Math.random() * 28,
      opacity: 0.22 + Math.random() * 0.2,
      variant: Math.floor(Math.random() * 3),
    };
  }

  function drawLeafOutline(ctx, variant) {
    ctx.beginPath();
    if (variant === 0) {
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(18, -7, 42, 3, 46, 22);
      ctx.bezierCurveTo(48, 38, 26, 46, 8, 36);
      ctx.bezierCurveTo(-6, 26, -5, 8, 0, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, 6);
      ctx.quadraticCurveTo(20, 22, 38, 30);
      ctx.stroke();
      return;
    }
    if (variant === 1) {
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(14, -4, 10, 16);
      ctx.quadraticCurveTo(6, 28, 0, 32);
      ctx.quadraticCurveTo(-6, 28, -10, 16);
      ctx.quadraticCurveTo(-14, -4, 0, -18);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 28);
      ctx.stroke();
      return;
    }
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(12, -10, 30, -6, 34, 10);
    ctx.bezierCurveTo(36, 22, 20, 30, 6, 24);
    ctx.bezierCurveTo(-4, 18, -2, 6, 0, 0);
    ctx.stroke();
  }

  function mountForest(host) {
    const shell = makeShell(host, "forest");
    const canvas = makeCanvas(shell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => shell.remove();

    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let lastTime = performance.now();

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    const leafCount = reduced ? 12 : 20;
    const leaves = Array.from({ length: leafCount }, () => createLeaf(width, height));

    let raf = 0;
    const draw = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const time = now / 1000;

      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(shell).color;

      for (const leaf of leaves) {
        const theta = time * leaf.swayOmega + leaf.phase;
        const swayX = reduced
          ? 0
          : Math.sin(theta) * leaf.swayAmp +
            Math.sin(theta * 0.47 + 1.2) * leaf.swayAmp * 0.18;
        const tilt = reduced ? 0 : Math.sin(theta - 0.5) * 0.28;

        ctx.save();
        ctx.translate(leaf.x + swayX, leaf.y);
        ctx.rotate(leaf.rotation + tilt);
        ctx.scale(leaf.scale, leaf.scale);
        ctx.strokeStyle = color;
        ctx.globalAlpha = leaf.opacity;
        ctx.lineWidth = 0.85;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        drawLeafOutline(ctx, leaf.variant);
        ctx.restore();

        if (!reduced) {
          leaf.y += leaf.speed * dt;
          if (leaf.y > height + 50) {
            Object.assign(leaf, createLeaf(width, height));
            leaf.y = -35 - Math.random() * 45;
          }
        }
      }

      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    let off = null;
    if (reduced) {
      draw(performance.now());
      off = observeTheme(() => draw(performance.now()));
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off?.();
      shell.remove();
    };
  }

  /* ═══ origami — scribble / kraft-paper creases (static, seeded) ═══ */

  const LOGICAL_W = 1000;
  const LOGICAL_H = 700;

  function drawKraftWrinkles(ctx, color) {
    const rand = createRng(0x6b726166); // "kraf"

    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Soft buckling bands — wide, very faint contour curves
    for (let i = 0; i < 5; i++) {
      const y0 = rand() * LOGICAL_H;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.028 + rand() * 0.03;
      ctx.lineWidth = 16 + rand() * 22;
      ctx.beginPath();
      ctx.moveTo(-40, y0);
      for (let x = 0; x <= LOGICAL_W + 40; x += 80) {
        ctx.quadraticCurveTo(
          x + 40,
          y0 + (rand() - 0.5) * 90,
          x + 80,
          y0 + (rand() - 0.5) * 70,
        );
      }
      ctx.stroke();
    }

    // Major creases — irregular quadratic arcs
    for (let i = 0; i < 13; i++) {
      const x1 = rand() * LOGICAL_W;
      const y1 = rand() * LOGICAL_H;
      const cx = rand() * LOGICAL_W;
      const cy = rand() * LOGICAL_H;
      const x2 = rand() * LOGICAL_W;
      const y2 = rand() * LOGICAL_H;

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.06 + rand() * 0.09;
      ctx.lineWidth = 0.9 + rand() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, cy, x2, y2);
      ctx.stroke();

      if (rand() > 0.62) {
        const ox = (rand() - 0.5) * 5;
        const oy = (rand() - 0.5) * 5;
        ctx.globalAlpha *= 0.55;
        ctx.lineWidth *= 0.65;
        ctx.beginPath();
        ctx.moveTo(x1 + ox, y1 + oy);
        ctx.quadraticCurveTo(cx + ox, cy + oy, x2 + ox, y2 + oy);
        ctx.stroke();
      }
    }

    // Fine micro-creases — short scratches
    for (let i = 0; i < 22; i++) {
      const x = rand() * LOGICAL_W;
      const y = rand() * LOGICAL_H;
      const len = 24 + rand() * 72;
      const angle = rand() * Math.PI * 2;
      const bend = (rand() - 0.5) * 28;

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.03 + rand() * 0.055;
      ctx.lineWidth = 0.35 + rand() * 0.45;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * len * 0.5 + bend,
        y + Math.sin(angle) * len * 0.5 - bend,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len,
      );
      ctx.stroke();
    }

    // Crumple hubs — several short lines radiating from a point
    for (let h = 0; h < 5; h++) {
      const hx = 120 + rand() * (LOGICAL_W - 240);
      const hy = 80 + rand() * (LOGICAL_H - 160);
      const spokes = 3 + Math.floor(rand() * 3);

      for (let s = 0; s < spokes; s++) {
        const angle = rand() * Math.PI * 2;
        const len = 28 + rand() * 58;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.04 + rand() * 0.065;
        ctx.lineWidth = 0.5 + rand() * 0.8;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(
          hx + Math.cos(angle) * len * 0.45 + (rand() - 0.5) * 12,
          hy + Math.sin(angle) * len * 0.45 + (rand() - 0.5) * 12,
          hx + Math.cos(angle) * len,
          hy + Math.sin(angle) * len,
        );
        ctx.stroke();
      }
    }

    // Kraft fiber grain — sparse speckle
    const speckles = Math.floor((LOGICAL_W * LOGICAL_H) / 1800);
    for (let i = 0; i < speckles; i++) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.018 + rand() * 0.028;
      const w = rand() > 0.82 ? 2 : 1;
      ctx.fillRect(rand() * LOGICAL_W, rand() * LOGICAL_H, w, w);
    }

    ctx.globalAlpha = 1;
  }

  function mountOrigami(host) {
    const shell = makeShell(host, "origami");
    const canvas = makeCanvas(shell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => shell.remove();

    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(LOGICAL_W * dpr);
      canvas.height = Math.floor(LOGICAL_H * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "cover";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawKraftWrinkles(ctx, getComputedStyle(shell).color);
    };

    paint();
    const off = observeTheme(paint);
    return () => {
      off();
      shell.remove();
    };
  }

  /* ═══ rain — gentle falling rain (canvas, rAF; static when reduced) ═══ */

  function mountRain(host) {
    const shell = makeShell(host, "rain");
    const canvas = makeCanvas(shell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => shell.remove();

    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    const dropCount = reduced ? 44 : 82;
    const drops = Array.from({ length: dropCount }, () => ({
      x: Math.random() * Math.max(width, 1),
      y: Math.random() * Math.max(height, 1),
      len: 10 + Math.random() * 18,
      speed: 1.2 + Math.random() * 2.2,
      opacity: 0.12 + Math.random() * 0.18,
      drift: 0.3 + Math.random() * 0.5,
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(shell).color;

      for (const d of drops) {
        ctx.globalAlpha = d.opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.drift, d.y + d.len);
        ctx.stroke();

        if (!reduced) {
          d.y += d.speed;
          d.x += d.drift * 0.15;
          if (d.y > height + d.len) {
            d.y = -d.len;
            d.x = Math.random() * width;
          }
        }
      }
      ctx.globalAlpha = 1;

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    let off = null;
    if (reduced) {
      draw();
      off = observeTheme(draw);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off?.();
      shell.remove();
    };
  }

  /* ═══ blueprint — technical drawing motifs (inline SVG, static) ═══ */

  const BLUEPRINT_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <rect x="680" y="48" width="260" height="168" rx="10" stroke="currentColor" stroke-width="0.9" stroke-dasharray="10 6" opacity="0.5"/>
  <line x1="680" y1="132" x2="940" y2="132" stroke="currentColor" stroke-width="0.55" stroke-dasharray="4 5" opacity="0.35"/>
  <line x1="810" y1="48" x2="810" y2="216" stroke="currentColor" stroke-width="0.55" stroke-dasharray="4 5" opacity="0.35"/>
  <g transform="translate(120 88)" opacity="0.48">
    <line x1="0" y1="0" x2="220" y2="0" stroke="currentColor" stroke-width="0.75"/>
    <line x1="0" y1="-6" x2="0" y2="6" stroke="currentColor" stroke-width="0.75"/>
    <line x1="220" y1="-6" x2="220" y2="6" stroke="currentColor" stroke-width="0.75"/>
    <line x1="110" y1="-4" x2="110" y2="4" stroke="currentColor" stroke-width="0.6" stroke-dasharray="2 3"/>
  </g>
  <g transform="translate(168 380)" opacity="0.42">
    <circle cx="0" cy="0" r="52" stroke="currentColor" stroke-width="0.85"/>
    <circle cx="0" cy="0" r="28" stroke="currentColor" stroke-width="0.65" stroke-dasharray="5 4"/>
    <line x1="-64" y1="0" x2="64" y2="0" stroke="currentColor" stroke-width="0.6" stroke-dasharray="4 4"/>
    <line x1="0" y1="-64" x2="0" y2="64" stroke="currentColor" stroke-width="0.6" stroke-dasharray="4 4"/>
  </g>
  <g transform="translate(72 520) rotate(-4)" opacity="0.4">
    <rect x="0" y="0" width="200" height="120" rx="14" stroke="currentColor" stroke-width="0.8" stroke-dasharray="9 5"/>
    <rect x="24" y="24" width="152" height="72" rx="8" stroke="currentColor" stroke-width="0.65" stroke-dasharray="6 4" opacity="0.75"/>
  </g>
  <g opacity="0.32">
    <line x1="520" y1="180" x2="720" y2="380" stroke="currentColor" stroke-width="0.65" stroke-dasharray="7 5"/>
    <line x1="720" y1="180" x2="520" y2="380" stroke="currentColor" stroke-width="0.65" stroke-dasharray="7 5"/>
  </g>
  <g transform="translate(860 580)" opacity="0.45">
    <path d="M 0 28 L 0 0 L 28 0" stroke="currentColor" stroke-width="0.85" fill="none"/>
    <path d="M 80 0 L 108 0 L 108 28" stroke="currentColor" stroke-width="0.85" fill="none"/>
    <path d="M 108 72 L 108 100 L 80 100" stroke="currentColor" stroke-width="0.85" fill="none"/>
    <path d="M 28 100 L 0 100 L 0 72" stroke="currentColor" stroke-width="0.85" fill="none"/>
  </g>
  <g transform="translate(480 120) rotate(12)" opacity="0.38">
    <polygon points="0,-24 21,-12 21,12 0,24 -21,12 -21,-12" stroke="currentColor" stroke-width="0.75" stroke-dasharray="6 4"/>
  </g>
  <g transform="translate(928 280)" opacity="0.4">
    <line x1="0" y1="0" x2="0" y2="160" stroke="currentColor" stroke-width="0.7"/>
    <line x1="-5" y1="0" x2="5" y2="0" stroke="currentColor" stroke-width="0.7"/>
    <line x1="-5" y1="160" x2="5" y2="160" stroke="currentColor" stroke-width="0.7"/>
  </g>
  <line x1="40" y1="248" x2="420" y2="248" stroke="currentColor" stroke-width="0.6" stroke-dasharray="12 7" opacity="0.3"/>
  <line x1="560" y1="620" x2="960" y2="620" stroke="currentColor" stroke-width="0.6" stroke-dasharray="12 7" opacity="0.28"/>
</svg>`;

  function mountBlueprint(host) {
    const shell = makeShell(host, "blueprint");
    shell.innerHTML = BLUEPRINT_SVG;
    return () => shell.remove();
  }

  /* ═══ starfield — dark: crescent moon + twinkling stars; light: sun + clouds ═══ */

  function skyY(h) {
    return Math.pow(Math.random(), 1.4) * h * 0.78;
  }

  function createStars(w, h, count) {
    return Array.from({ length: count }, () => {
      const twinkles = Math.random() < 0.48;
      return {
        x: Math.random() * w,
        y: skyY(h),
        r: 0.32 + Math.random() * 0.42,
        bright: 0.3 + Math.random() * 0.38,
        period: twinkles ? 2.6 + Math.random() * 3.4 : 0,
        phase: Math.random() * 10,
      };
    });
  }

  function createClouds(w, h) {
    const sizes = [88, 72, 96];
    return sizes.map((size, i) => ({
      x: (w / sizes.length) * (i + 0.5) + (Math.random() - 0.5) * 80,
      y: h * (0.1 + i * 0.11 + Math.random() * 0.06),
      size,
      speed: 5 + i * 2,
      bob: Math.random() * Math.PI * 2,
    }));
  }

  /** Spawn interval: ~1.8–3.6s between streaks (dark mode only). */
  function nextMeteorDelay() {
    return 1800 + Math.random() * 1800;
  }

  function spawnMeteor(w, h) {
    // Start inside the upper radial-mask sweet spot so trails aren't clipped to nothing.
    const x = w * (0.12 + Math.random() * 0.62);
    const y = -20 - Math.random() * 40;
    const speed = 380 + Math.random() * 220;
    const angle = Math.PI / 4.8 + Math.random() * 0.35;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: 64 + Math.random() * 44,
      life: 0,
      maxLife: 0.7 + Math.random() * 0.4,
    };
  }

  /** Round crescent moon — geometric body, light sketch rim. */
  function drawCrescentMoon(ctx, cx, cy, r, color, alpha) {
    ctx.save();
    ctx.fillStyle = color;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx + r * 0.44, cy - r * 0.04, r * 0.86, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.28;
    for (const [dx, dy, cr] of [
      [-r * 0.18, r * 0.1, r * 0.055],
      [r * 0.04, -r * 0.16, r * 0.04],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, cr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Round sun disc + short uneven rays (sketch feel, perfect circle). */
  function drawSun(ctx, cx, cy, r, color, alpha) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";

    const rays = 10;
    ctx.globalAlpha = alpha * 0.42;
    ctx.lineWidth = 1.15;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
      const outer = r * (1.28 + (i % 3) * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1));
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.48;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Soft cloud built from overlapping circles + one smooth top outline.
   * All puffs are round — reads as a single fluffy mass, not flat ellipses.
   */
  function drawCloud(ctx, cx, cy, size, color, alpha) {
    const puffs = [
      { ox: 0, oy: 0, r: size * 0.34 },
      { ox: -size * 0.28, oy: size * 0.1, r: size * 0.24 },
      { ox: size * 0.3, oy: size * 0.08, r: size * 0.26 },
      { ox: -size * 0.1, oy: -size * 0.12, r: size * 0.2 },
      { ox: size * 0.12, oy: -size * 0.1, r: size * 0.18 },
    ];

    ctx.save();
    ctx.fillStyle = color;

    ctx.globalAlpha = alpha * 0.14;
    for (const p of puffs) {
      ctx.beginPath();
      ctx.arc(cx + p.ox, cy + p.oy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const baseY = cy + size * 0.2;
    const leftX = cx - size * 0.5;
    const rightX = cx + size * 0.5;

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.36;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(leftX, baseY);
    ctx.arc(cx - size * 0.28, cy + size * 0.1, size * 0.24, Math.PI * 1.02, Math.PI * 0.08, false);
    ctx.arc(cx - size * 0.1, cy - size * 0.12, size * 0.2, Math.PI * 0.95, Math.PI * 0.22, false);
    ctx.arc(cx, cy, size * 0.34, Math.PI * 1.05, Math.PI * 0.02, false);
    ctx.arc(cx + size * 0.12, cy - size * 0.1, size * 0.18, Math.PI * 0.92, Math.PI * 0.28, false);
    ctx.arc(cx + size * 0.3, cy + size * 0.08, size * 0.26, Math.PI * 1.0, Math.PI * 0.12, false);
    ctx.lineTo(rightX, baseY);
    ctx.stroke();
    ctx.restore();
  }

  function mountStarfield(host) {
    const shell = makeShell(host, "starfield");
    const canvas = makeCanvas(shell);
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => shell.remove();

    const reduced = prefersReducedMotion();
    let isDark = document.documentElement.getAttribute("data-theme") === "dark";
    let width = 0;
    let height = 0;
    let lastTime = performance.now();
    let stars = [];
    let clouds = [];
    let meteors = [];
    let nextMeteorAt = performance.now() + 200;

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(width, height, reduced ? 72 : 108);
      clouds = createClouds(width, height);
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    const moonPos = () => ({
      x: width * 0.78,
      y: height * 0.14,
      r: Math.min(width, height) * 0.05,
    });

    const sunPos = () => ({
      x: width * 0.2,
      y: height * 0.13,
      r: Math.min(width, height) * 0.046,
    });

    let raf = 0;
    const draw = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(shell).color;

      if (isDark) {
        const moon = moonPos();
        drawCrescentMoon(ctx, moon.x, moon.y, moon.r, color, 0.4);

        for (const s of stars) {
          let alpha = s.bright;
          if (!reduced && s.period > 0) {
            const wave = 0.5 + 0.5 * Math.sin(((t + s.phase) / s.period) * Math.PI * 2);
            alpha = s.bright * (0.28 + wave * 0.72);
          }

          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (!reduced) {
          if (now >= nextMeteorAt) {
            meteors.push(spawnMeteor(width, height));
            if (Math.random() > 0.78) meteors.push(spawnMeteor(width, height));
            nextMeteorAt = now + nextMeteorDelay();
          }

          meteors = meteors.filter((m) => {
            m.life += dt;
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            const fade = 1 - m.life / m.maxLife;
            if (fade <= 0) return false;

            const hyp = Math.hypot(m.vx, m.vy) || 1;
            const nx = m.vx / hyp;
            const ny = m.vy / hyp;

            ctx.strokeStyle = color;
            ctx.lineCap = "round";

            // Soft outer trail
            ctx.globalAlpha = 0.14 * fade;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - nx * m.len * 1.08, m.y - ny * m.len * 1.08);
            ctx.stroke();

            // Bright core
            ctx.globalAlpha = 0.75 * fade;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - nx * m.len, m.y - ny * m.len);
            ctx.stroke();

            // Head
            ctx.beginPath();
            ctx.globalAlpha = 0.85 * fade;
            ctx.arc(m.x, m.y, 1.15, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            return true;
          });
        }
      } else {
        const sun = sunPos();
        drawSun(ctx, sun.x, sun.y, sun.r, color, 0.36);

        for (const c of clouds) {
          if (!reduced) {
            c.x += c.speed * dt;
            if (c.x > width + c.size) c.x = -c.size;
          }
          const bob = reduced ? 0 : Math.sin(t * 0.4 + c.bob) * 2;
          drawCloud(ctx, c.x, c.y + bob, c.size, color, 0.55);
        }
      }

      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    // tsx re-runs the whole effect on resolvedTheme flip — mirror that:
    // rebuild the scene only when light/dark actually changes; a pack-only
    // swap just needs a repaint (colors are CSS vars, read every frame).
    const off = observeTheme(() => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (dark !== isDark) {
        isDark = dark;
        lastTime = performance.now();
        meteors = [];
        nextMeteorAt = performance.now() + 200;
        syncSize();
      }
      if (reduced) draw(performance.now());
    });

    if (reduced) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      off();
      shell.remove();
    };
  }

  /* ═══ circuit — PCB-style traces & pads (inline SVG, static) ═══ */

  const CIRCUIT_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <g opacity="0.7">
    <path d="M 60 80 H 180 V 140 H 240 V 200 H 160 V 260 H 100 V 200 H 60 Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="60" cy="80" r="3.2" fill="currentColor"/>
    <circle cx="180" cy="80" r="2.6" fill="currentColor"/>
    <circle cx="240" cy="140" r="2.6" fill="currentColor"/>
    <circle cx="160" cy="260" r="3" fill="currentColor"/>
    <circle cx="100" cy="200" r="2.4" fill="currentColor"/>
  </g>
  <g opacity="0.55">
    <path d="M 280 180 H 420 V 120 H 520 V 220 H 620 V 160 H 740" stroke="currentColor" stroke-width="0.95" stroke-linejoin="round"/>
    <circle cx="280" cy="180" r="2.8" fill="currentColor"/>
    <circle cx="420" cy="180" r="2.4" fill="currentColor"/>
    <circle cx="520" cy="120" r="2.4" fill="currentColor"/>
    <circle cx="620" cy="220" r="2.6" fill="currentColor"/>
    <circle cx="740" cy="160" r="3" fill="currentColor"/>
  </g>
  <g transform="translate(780 72)" opacity="0.62">
    <rect x="0" y="0" width="140" height="96" rx="4" stroke="currentColor" stroke-width="1"/>
    <rect x="28" y="22" width="84" height="52" rx="2" stroke="currentColor" stroke-width="0.75" stroke-dasharray="4 3"/>
    <path d="M 18 0 V -16 M 42 0 V -16 M 66 0 V -16 M 90 0 V -16 M 114 0 V -16" stroke="currentColor" stroke-width="0.85"/>
    <path d="M 18 96 V 112 M 42 96 V 112 M 66 96 V 112 M 90 96 V 112 M 114 96 V 112" stroke="currentColor" stroke-width="0.85"/>
    <circle cx="18" cy="-16" r="2.2" fill="currentColor"/>
    <circle cx="114" cy="112" r="2.2" fill="currentColor"/>
  </g>
  <g opacity="0.5">
    <path d="M 80 420 H 200 V 500 H 320 V 460 H 400" stroke="currentColor" stroke-width="0.95" stroke-linejoin="round"/>
    <circle cx="80" cy="420" r="5" stroke="currentColor" stroke-width="0.85" fill="none"/>
    <circle cx="80" cy="420" r="2" fill="currentColor"/>
    <circle cx="200" cy="420" r="2.4" fill="currentColor"/>
    <circle cx="320" cy="500" r="2.6" fill="currentColor"/>
    <circle cx="400" cy="460" r="2.4" fill="currentColor"/>
  </g>
  <g opacity="0.48">
    <path d="M 860 280 V 360 H 920 V 440 H 840 V 520 H 900 V 580" stroke="currentColor" stroke-width="0.95" stroke-linejoin="round"/>
    <circle cx="860" cy="280" r="2.6" fill="currentColor"/>
    <circle cx="920" cy="360" r="2.4" fill="currentColor"/>
    <circle cx="840" cy="440" r="2.4" fill="currentColor"/>
    <circle cx="900" cy="580" r="3" fill="currentColor"/>
  </g>
  <g opacity="0.45">
    <path d="M 120 620 H 280 V 580 H 460 V 640 H 640 V 600 H 780" stroke="currentColor" stroke-width="0.9" stroke-linejoin="round"/>
    <circle cx="120" cy="620" r="2.4" fill="currentColor"/>
    <circle cx="280" cy="620" r="2.2" fill="currentColor"/>
    <circle cx="460" cy="580" r="2.4" fill="currentColor"/>
    <circle cx="640" cy="640" r="2.6" fill="currentColor"/>
    <circle cx="780" cy="600" r="2.4" fill="currentColor"/>
  </g>
  <g transform="translate(480 300)" opacity="0.42">
    <rect x="0" y="0" width="72" height="48" rx="3" stroke="currentColor" stroke-width="0.85"/>
    <path d="M 12 0 V -12 M 36 0 V -12 M 60 0 V -12" stroke="currentColor" stroke-width="0.75"/>
    <path d="M 12 48 V 60 M 36 48 V 60 M 60 48 V 60" stroke="currentColor" stroke-width="0.75"/>
    <path d="M 72 16 H 100 V 40 H 120" stroke="currentColor" stroke-width="0.8"/>
    <circle cx="120" cy="40" r="2.4" fill="currentColor"/>
  </g>
</svg>`;

  function mountCircuit(host) {
    const shell = makeShell(host, "circuit");
    shell.innerHTML = CIRCUIT_SVG;
    return () => shell.remove();
  }

  /* ═══ bookshelf — three staggered shelves (inline SVG, static) ═══ */

  const BOOKSHELF_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <g transform="translate(40 68)" opacity="0.62">
    <rect x="0" y="22" width="12" height="78" stroke="currentColor" stroke-width="0.85"/>
    <rect x="16" y="8" width="14" height="92" stroke="currentColor" stroke-width="0.95"/>
    <rect x="34" y="26" width="10" height="74" stroke="currentColor" stroke-width="0.8"/>
    <rect x="48" y="4" width="15" height="96" stroke="currentColor" stroke-width="0.95"/>
    <rect x="67" y="18" width="11" height="82" stroke="currentColor" stroke-width="0.85"/>
    <rect x="82" y="28" width="9" height="72" stroke="currentColor" stroke-width="0.75"/>
    <rect x="95" y="10" width="13" height="90" stroke="currentColor" stroke-width="0.9"/>
    <rect x="112" y="20" width="10" height="80" stroke="currentColor" stroke-width="0.8"/>
    <rect x="126" y="6" width="14" height="94" stroke="currentColor" stroke-width="0.9"/>
    <rect x="144" y="24" width="11" height="76" stroke="currentColor" stroke-width="0.8"/>
    <rect x="159" y="12" width="9" height="88" stroke="currentColor" stroke-width="0.75"/>
    <rect x="172" y="2" width="15" height="98" stroke="currentColor" stroke-width="0.95"/>
    <rect x="191" y="18" width="12" height="82" stroke="currentColor" stroke-width="0.85"/>
    <rect x="207" y="28" width="10" height="72" stroke="currentColor" stroke-width="0.8"/>
    <rect x="221" y="8" width="13" height="92" stroke="currentColor" stroke-width="0.9"/>
    <rect x="238" y="20" width="9" height="80" stroke="currentColor" stroke-width="0.75"/>
    <rect x="251" y="14" width="14" height="86" stroke="currentColor" stroke-width="0.9"/>
    <rect x="269" y="24" width="11" height="76" stroke="currentColor" stroke-width="0.8"/>
    <line x1="4" y1="40" x2="11" y2="40" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="52" y1="32" x2="60" y2="32" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="176" y1="28" x2="185" y2="28" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="254" y1="36" x2="262" y2="36" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="-6" y1="104" x2="290" y2="104" stroke="currentColor" stroke-width="1.05"/>
  </g>
  <g transform="translate(360 278)" opacity="0.5">
    <rect x="0" y="18" width="11" height="72" stroke="currentColor" stroke-width="0.8"/>
    <rect x="15" y="4" width="14" height="86" stroke="currentColor" stroke-width="0.9"/>
    <rect x="33" y="22" width="9" height="68" stroke="currentColor" stroke-width="0.75"/>
    <rect x="46" y="0" width="13" height="90" stroke="currentColor" stroke-width="0.9"/>
    <rect x="63" y="14" width="10" height="76" stroke="currentColor" stroke-width="0.8"/>
    <rect x="77" y="26" width="12" height="64" stroke="currentColor" stroke-width="0.85"/>
    <rect x="93" y="8" width="15" height="82" stroke="currentColor" stroke-width="0.95"/>
    <rect x="112" y="18" width="9" height="72" stroke="currentColor" stroke-width="0.75"/>
    <rect x="125" y="2" width="11" height="88" stroke="currentColor" stroke-width="0.85"/>
    <rect x="140" y="20" width="14" height="70" stroke="currentColor" stroke-width="0.9"/>
    <rect x="158" y="10" width="10" height="80" stroke="currentColor" stroke-width="0.8"/>
    <rect x="172" y="24" width="8" height="66" stroke="currentColor" stroke-width="0.7"/>
    <rect x="184" y="6" width="13" height="84" stroke="currentColor" stroke-width="0.85"/>
    <rect x="201" y="16" width="11" height="74" stroke="currentColor" stroke-width="0.8"/>
    <rect x="216" y="28" width="9" height="62" stroke="currentColor" stroke-width="0.75"/>
    <rect x="229" y="4" width="14" height="86" stroke="currentColor" stroke-width="0.9"/>
    <rect x="247" y="18" width="10" height="72" stroke="currentColor" stroke-width="0.8"/>
    <rect x="261" y="12" width="12" height="78" stroke="currentColor" stroke-width="0.85"/>
    <line x1="18" y1="30" x2="26" y2="30" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="98" y1="36" x2="106" y2="36" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="188" y1="32" x2="195" y2="32" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="250" y1="40" x2="258" y2="40" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="-6" y1="94" x2="282" y2="94" stroke="currentColor" stroke-width="1"/>
  </g>
  <g transform="translate(520 500)" opacity="0.48">
    <rect x="0" y="20" width="12" height="74" stroke="currentColor" stroke-width="0.85"/>
    <rect x="16" y="6" width="10" height="88" stroke="currentColor" stroke-width="0.9"/>
    <rect x="30" y="24" width="14" height="70" stroke="currentColor" stroke-width="0.85"/>
    <rect x="48" y="10" width="9" height="84" stroke="currentColor" stroke-width="0.75"/>
    <rect x="61" y="2" width="15" height="92" stroke="currentColor" stroke-width="0.95"/>
    <rect x="80" y="18" width="11" height="76" stroke="currentColor" stroke-width="0.8"/>
    <rect x="95" y="28" width="8" height="66" stroke="currentColor" stroke-width="0.7"/>
    <rect x="107" y="8" width="13" height="86" stroke="currentColor" stroke-width="0.9"/>
    <rect x="124" y="16" width="10" height="78" stroke="currentColor" stroke-width="0.8"/>
    <rect x="138" y="4" width="14" height="90" stroke="currentColor" stroke-width="0.9"/>
    <rect x="156" y="22" width="9" height="72" stroke="currentColor" stroke-width="0.75"/>
    <rect x="169" y="12" width="12" height="82" stroke="currentColor" stroke-width="0.85"/>
    <rect x="185" y="26" width="10" height="68" stroke="currentColor" stroke-width="0.8"/>
    <rect x="199" y="0" width="13" height="94" stroke="currentColor" stroke-width="0.9"/>
    <rect x="216" y="14" width="11" height="80" stroke="currentColor" stroke-width="0.85"/>
    <rect x="231" y="22" width="9" height="72" stroke="currentColor" stroke-width="0.75"/>
    <rect x="244" y="8" width="14" height="86" stroke="currentColor" stroke-width="0.9"/>
    <line x1="64" y1="30" x2="73" y2="30" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="142" y1="34" x2="150" y2="34" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="220" y1="36" x2="228" y2="36" stroke="currentColor" stroke-width="0.5" opacity="0.6"/>
    <line x1="-6" y1="98" x2="268" y2="98" stroke="currentColor" stroke-width="1"/>
  </g>
</svg>`;

  function mountBookshelf(host) {
    const shell = makeShell(host, "bookshelf");
    shell.innerHTML = BOOKSHELF_SVG;
    return () => shell.remove();
  }

  /* ═══ clips — paperclips & bookmark ribbons (inline SVG, static) ═══ */

  const CLIPS_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <g transform="translate(90 80) rotate(-18)" opacity="0.7">
    <path d="M 8 4 C 8 -6 28 -6 28 4 L 28 52 C 28 68 8 68 8 52 L 8 18 C 8 10 18 10 18 18 L 18 46 C 18 52 12 52 12 46 L 12 22" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g transform="translate(820 260) rotate(22)" opacity="0.55">
    <path d="M 6 3 C 6 -5 22 -5 22 3 L 22 44 C 22 58 6 58 6 44 L 6 16 C 6 9 15 9 15 16 L 15 38 C 15 44 10 44 10 38 L 10 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g transform="translate(380 540) rotate(-8)" opacity="0.4">
    <path d="M 5 2 C 5 -4 18 -4 18 2 L 18 36 C 18 48 5 48 5 36 L 5 14 C 5 8 12 8 12 14 L 12 32 C 12 36 8 36 8 32 L 8 16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <g transform="translate(860 48) rotate(6)" opacity="0.58">
    <path d="M 0 0 L 36 0 L 36 110 L 18 92 L 0 110 Z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
    <line x1="8" y1="18" x2="28" y2="18" stroke="currentColor" stroke-width="0.7" opacity="0.7"/>
    <line x1="8" y1="28" x2="28" y2="28" stroke="currentColor" stroke-width="0.7" opacity="0.55"/>
  </g>
  <g transform="translate(70 480) rotate(-12)" opacity="0.38">
    <path d="M 0 0 L 22 0 L 22 86 L 11 72 L 0 86 Z" stroke="currentColor" stroke-width="0.95" stroke-linejoin="round"/>
  </g>
</svg>`;

  function mountClips(host) {
    const shell = makeShell(host, "clips");
    shell.innerHTML = CLIPS_SVG;
    return () => shell.remove();
  }

  /* ═══ stamp — desk rubber stamps / postmarks (inline SVG, static) ═══ */

  const STAMP_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <g transform="translate(800 110) rotate(12)" opacity="0.72">
    <circle cx="0" cy="0" r="78" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/>
    <circle cx="0" cy="0" r="62" stroke="currentColor" stroke-width="0.9" opacity="0.75"/>
    <text x="0" y="9" text-anchor="middle" fill="currentColor" font-size="24" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" letter-spacing="3.5">DRAFT</text>
    <text x="0" y="-30" text-anchor="middle" fill="currentColor" font-size="10" font-family="ui-sans-serif, system-ui, sans-serif" opacity="0.8" letter-spacing="2">PRISM</text>
    <text x="0" y="38" text-anchor="middle" fill="currentColor" font-size="9" font-family="ui-sans-serif, system-ui, sans-serif" opacity="0.7" letter-spacing="1.2">REVIEW</text>
  </g>
  <g transform="translate(150 540) rotate(-9)" opacity="0.58">
    <rect x="-56" y="-32" width="112" height="64" rx="5" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="0" y="-2" text-anchor="middle" fill="currentColor" font-size="14" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" letter-spacing="2">NOTE</text>
    <line x1="-36" y1="12" x2="36" y2="12" stroke="currentColor" stroke-width="0.8" opacity="0.65"/>
    <text x="0" y="26" text-anchor="middle" fill="currentColor" font-size="9" font-family="ui-sans-serif, system-ui, sans-serif" opacity="0.75">· · ·</text>
  </g>
  <g transform="translate(110 250) rotate(8)" opacity="0.5">
    <circle cx="0" cy="0" r="36" stroke="currentColor" stroke-width="1.1" stroke-dasharray="3 3"/>
    <circle cx="0" cy="0" r="26" stroke="currentColor" stroke-width="0.7" opacity="0.6"/>
    <text x="0" y="6" text-anchor="middle" fill="currentColor" font-size="14" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" letter-spacing="1">OK</text>
  </g>
  <g transform="translate(820 560) rotate(-6)" opacity="0.45">
    <ellipse cx="0" cy="0" rx="52" ry="28" stroke="currentColor" stroke-width="1.1" stroke-dasharray="4 3"/>
    <text x="0" y="5" text-anchor="middle" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" letter-spacing="2">WIP</text>
  </g>
  <g transform="translate(320 80) rotate(-14)" opacity="0.38">
    <rect x="-40" y="-18" width="80" height="36" rx="3" stroke="currentColor" stroke-width="0.95" stroke-dasharray="3 2.5"/>
    <text x="0" y="5" text-anchor="middle" fill="currentColor" font-size="11" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="600" letter-spacing="1.5">CHECK</text>
  </g>
</svg>`;

  function mountStamp(host) {
    const shell = makeShell(host, "stamp");
    shell.innerHTML = STAMP_SVG;
    return () => shell.remove();
  }

  /* ═══ pendulum — slow swing + hourglass outlines (inline SVG + CSS anim) ═══ */

  const PENDULUM_HTML = `<style>
@keyframes prism-pendulum-swing {
  0%, 100% { transform: rotate(-14deg); }
  50% { transform: rotate(14deg); }
}
.prism-pendulum-arm {
  animation: prism-pendulum-swing 7s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: 50% 0%;
}
@media (prefers-reduced-motion: reduce) {
  .prism-pendulum-arm { animation: none; transform: rotate(6deg); }
}
</style>
<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <g transform="translate(820 90)" opacity="0.65">
    <circle cx="0" cy="0" r="3" fill="currentColor" opacity="0.7"/>
    <g class="prism-pendulum-arm">
      <line x1="0" y1="0" x2="0" y2="120" stroke="currentColor" stroke-width="0.95"/>
      <circle cx="0" cy="120" r="10" stroke="currentColor" stroke-width="1.1"/>
      <circle cx="0" cy="120" r="3.5" fill="currentColor" opacity="0.5"/>
    </g>
  </g>
  <g transform="translate(120 480) rotate(-8)" opacity="0.45">
    <path d="M -28 -52 L 28 -52 L 8 0 L 28 52 L -28 52 L -8 0 Z" stroke="currentColor" stroke-width="1.05" stroke-linejoin="round"/>
    <line x1="-18" y1="-32" x2="18" y2="-32" stroke="currentColor" stroke-width="0.6" opacity="0.55"/>
    <line x1="-12" y1="32" x2="12" y2="32" stroke="currentColor" stroke-width="0.6" opacity="0.55"/>
    <path d="M -4 0 L 4 0" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>
  </g>
  <g transform="translate(720 560) rotate(6)" opacity="0.28">
    <path d="M -18 -34 L 18 -34 L 5 0 L 18 34 L -18 34 L -5 0 Z" stroke="currentColor" stroke-width="0.85" stroke-linejoin="round"/>
  </g>
</svg>`;

  function mountPendulum(host) {
    const shell = makeShell(host, "pendulum");
    shell.innerHTML = PENDULUM_HTML;
    return () => shell.remove();
  }

  /* ═══ constellation — dots linked by thin strokes (inline SVG, static) ═══ */

  const CONSTELLATION_SVG = `<svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%">
  <g opacity="0.58">
    <path d="M 120 90 L 160 120 L 200 85 L 240 110 L 280 70" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 160 120 L 180 160 L 220 150" stroke="currentColor" stroke-width="0.75" stroke-linecap="round" opacity="0.75"/>
    <circle cx="120" cy="90" r="2.8" fill="currentColor"/>
    <circle cx="160" cy="120" r="2.2" fill="currentColor"/>
    <circle cx="200" cy="85" r="3" fill="currentColor"/>
    <circle cx="240" cy="110" r="2.4" fill="currentColor"/>
    <circle cx="280" cy="70" r="2.6" fill="currentColor"/>
    <circle cx="180" cy="160" r="2" fill="currentColor" opacity="0.8"/>
    <circle cx="220" cy="150" r="2.2" fill="currentColor" opacity="0.8"/>
  </g>
  <g opacity="0.48">
    <path d="M 680 100 L 720 140 L 760 95 L 800 130 L 840 88" stroke="currentColor" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="680" cy="100" r="2.4" fill="currentColor"/>
    <circle cx="720" cy="140" r="2.8" fill="currentColor"/>
    <circle cx="760" cy="95" r="2.2" fill="currentColor"/>
    <circle cx="800" cy="130" r="2.6" fill="currentColor"/>
    <circle cx="840" cy="88" r="2.4" fill="currentColor"/>
  </g>
  <g opacity="0.38">
    <path d="M 480 280 L 520 320 L 440 310 Z" stroke="currentColor" stroke-width="0.75" stroke-linejoin="round"/>
    <circle cx="480" cy="280" r="2" fill="currentColor"/>
    <circle cx="520" cy="320" r="2.2" fill="currentColor"/>
    <circle cx="440" cy="310" r="1.8" fill="currentColor"/>
  </g>
  <g opacity="0.42">
    <path d="M 200 520 L 260 480 L 320 510 L 380 470 L 440 500" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="200" cy="520" r="2.2" fill="currentColor"/>
    <circle cx="260" cy="480" r="2.6" fill="currentColor"/>
    <circle cx="320" cy="510" r="2" fill="currentColor"/>
    <circle cx="380" cy="470" r="2.4" fill="currentColor"/>
    <circle cx="440" cy="500" r="2.2" fill="currentColor"/>
  </g>
  <g opacity="0.28">
    <line x1="860" y1="480" x2="900" y2="520" stroke="currentColor" stroke-width="0.7"/>
    <circle cx="860" cy="480" r="1.8" fill="currentColor"/>
    <circle cx="900" cy="520" r="1.6" fill="currentColor"/>
  </g>
</svg>`;

  function mountConstellation(host) {
    const shell = makeShell(host, "constellation");
    shell.innerHTML = CONSTELLATION_SVG;
    return () => shell.remove();
  }

  /* ═══ registry ═══ */

  const MODULES = {
    ink: mountInk,
    academic: mountAcademic,
    origami: mountOrigami,
    rain: mountRain,
    forest: mountForest,
    blueprint: mountBlueprint,
    starfield: mountStarfield,
    circuit: mountCircuit,
    bookshelf: mountBookshelf,
    clips: mountClips,
    paperplane: mountPaperplane,
    stamp: mountStamp,
    pendulum: mountPendulum,
    constellation: mountConstellation,
  };

  let cleanup = null;

  window.PrismBackdrops = {
    STYLES: [
      { id: "ink", labelKey: "backdropInk" },
      { id: "academic", labelKey: "backdropAcademic" },
      { id: "origami", labelKey: "backdropOrigami" },
      { id: "rain", labelKey: "backdropRain" },
      { id: "forest", labelKey: "backdropForest" },
      { id: "blueprint", labelKey: "backdropBlueprint" },
      { id: "starfield", labelKey: "backdropStarfield" },
      { id: "circuit", labelKey: "backdropCircuit" },
      { id: "bookshelf", labelKey: "backdropBookshelf" },
      { id: "clips", labelKey: "backdropClips" },
      { id: "paperplane", labelKey: "backdropPaperplane" },
      { id: "stamp", labelKey: "backdropStamp" },
      { id: "pendulum", labelKey: "backdropPendulum" },
      { id: "constellation", labelKey: "backdropConstellation" },
    ],
    isValid(styleId) {
      return Object.prototype.hasOwnProperty.call(MODULES, styleId);
    },
    mount(host, styleId) {
      this.unmount();
      if (!host) return;
      const fn = MODULES[styleId] || MODULES.ink;
      cleanup = fn(host);
    },
    unmount() {
      if (!cleanup) return;
      try {
        cleanup();
      } catch {
        /* ignore */
      }
      cleanup = null;
    },
  };
})();
