/* Living-preprint interactions: wireframe manifold. */
(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── Fig. 1: interactive wireframe manifold ── */
  function setupManifold() {
    const canvas = document.getElementById("manifold-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const N = 34; // grid resolution
    const SPAN = 3.4; // world units across
    const SCALE = (H * 0.62) / (SPAN * 1.55);

    let rotY = 0.7;
    let rotX = 0.95;
    let dragging = false;
    let visible = true;
    let lastX = 0;
    let lastY = 0;
    let t = 0;

    // Precompute grid uv coordinates once.
    const uv = [];
    for (let i = 0; i < N; i++) {
      uv.push((i / (N - 1) - 0.5) * SPAN);
    }

    function height(u, v, time) {
      const r = Math.hypot(u, v);
      return Math.cos(r * 2.5 - time * 0.9) * Math.exp(-r * r * 0.42) * 0.85;
    }

    function project(u, v, z, cosY, sinY, cosX, sinX) {
      const x1 = u * cosY - v * sinY;
      const y1 = u * sinY + v * cosY;
      const y2 = y1 * cosX - z * sinX;
      return [W / 2 + x1 * SCALE * 1.55, H / 2 + y2 * SCALE];
    }

    function accentColor() {
      const c = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-hot")
        .trim();
      return c || "#3d9b8f";
    }

    function inkColor() {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      return c || "#888";
    }

    function frame() {
      requestAnimationFrame(frame);
      if (!visible) return;

      if (!dragging && !reducedMotion) {
        rotY += 0.0028;
        t += 0.016;
      }

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Height field for this frame.
      const field = new Float32Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          field[j * N + i] = height(uv[i], uv[j], t);
        }
      }

      ctx.clearRect(0, 0, W, H);

      const accent = accentColor();
      const ink = inkColor();

      // Mesh lines — rows.
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = accent;
      ctx.beginPath();
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const [px, py] = project(uv[i], uv[j], field[j * N + i], cosY, sinY, cosX, sinX);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();

      // Mesh lines — columns.
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const [px, py] = project(uv[i], uv[j], field[j * N + i], cosY, sinY, cosX, sinX);
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();

      // A "geodesic" ring at r = 1.15, drawn stronger.
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const SEG = 90;
      for (let s = 0; s <= SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const u = Math.cos(a) * 1.15;
        const v = Math.sin(a) * 1.15;
        const [px, py] = project(u, v, height(u, v, t) + 0.02, cosY, sinY, cosX, sinX);
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Peak marker.
      const [peakX, peakY] = project(0, 0, height(0, 0, t), cosY, sinY, cosX, sinX);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(peakX, peakY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      rotY += dx * 0.006;
      rotX = Math.min(1.35, Math.max(0.4, rotX + dy * 0.004));
    });
    const endDrag = (e) => {
      dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    // Pause rendering while offscreen.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
        });
      },
      { threshold: 0.05 },
    );
    io.observe(canvas);

    requestAnimationFrame(frame);
  }

  setupManifold();
})();
