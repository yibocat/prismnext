import { ChatHomeBackdropShell } from "./shared";

const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";

/** Faint math / physics / chemistry / biology motifs — default for Academic theme. */
export function AcademicBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.36] dark:opacity-[0.28]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Math (sparse) ── */}
        <text
          x="72"
          y="108"
          fill="currentColor"
          fontSize="28"
          fontFamily={SERIF}
          transform="rotate(-7 72 108)"
          opacity="0.82"
        >
          ∫ f(x) dx
        </text>
        <text
          x="760"
          y="92"
          fill="currentColor"
          fontSize="16"
          fontFamily={SERIF}
          opacity="0.68"
        >
          ∮_C f(z) dz = 2πi Σ Res(f, zₖ)
        </text>
        <text
          x="200"
          y="598"
          fill="currentColor"
          fontSize="26"
          fontFamily={SERIF}
          transform="rotate(6 200 598)"
          opacity="0.7"
        >
          e^(iπ) + 1 = 0
        </text>
        <text
          x="300"
          y="200"
          fill="currentColor"
          fontSize="36"
          fontFamily={SERIF}
          opacity="0.42"
        >
          π
        </text>
        <text
          x="500"
          y="520"
          fill="currentColor"
          fontSize="19"
          fontFamily={SERIF}
          transform="rotate(8 500 520)"
          opacity="0.46"
        >
          sin²θ + cos²θ = 1
        </text>
        <text
          x="48"
          y="248"
          fill="currentColor"
          fontSize="17"
          fontFamily={SERIF}
          opacity="0.52"
        >
          ∂²u/∂t² = c²∇²u
        </text>
        <text
          x="420"
          y="660"
          fill="currentColor"
          fontSize="14"
          fontFamily={SERIF}
          transform="rotate(-3 420 660)"
          opacity="0.4"
        >
          ℒ{'{f(t)}'} = ∫₀^∞ f(t)e^(−st) dt
        </text>

        {/* ── Physics ── */}
        <text
          x="700"
          y="168"
          fill="currentColor"
          fontSize="30"
          fontFamily={SERIF}
          opacity="0.78"
        >
          E = mc²
        </text>
        <text
          x="88"
          y="520"
          fill="currentColor"
          fontSize="26"
          fontFamily={SERIF}
          opacity="0.65"
        >
          F = ma
        </text>
        <text
          x="842"
          y="340"
          fill="currentColor"
          fontSize="19"
          fontFamily={SERIF}
          opacity="0.62"
        >
          ∇·E = ρ/ε₀
        </text>
        <text
          x="260"
          y="88"
          fill="currentColor"
          fontSize="17"
          fontFamily={SERIF}
          transform="rotate(-5 260 88)"
          opacity="0.58"
        >
          iℏ ∂ψ/∂t = Ĥψ
        </text>
        <text
          x="140"
          y="450"
          fill="currentColor"
          fontSize="16"
          fontFamily={SERIF}
          transform="rotate(7 140 450)"
          opacity="0.5"
        >
          Δx · Δp ≥ ℏ/2
        </text>
        <text
          x="640"
          y="612"
          fill="currentColor"
          fontSize="21"
          fontFamily={SERIF}
          transform="rotate(-5 640 612)"
          opacity="0.58"
        >
          λ = h/p
        </text>

        {/* ── Chemistry ── */}
        <text
          x="860"
          y="548"
          fill="currentColor"
          fontSize="27"
          fontFamily={SERIF}
          opacity="0.68"
        >
          H₂O
        </text>
        <text
          x="420"
          y="88"
          fill="currentColor"
          fontSize="22"
          fontFamily={SERIF}
          transform="rotate(5 420 88)"
          opacity="0.52"
        >
          C₆H₁₂O₆
        </text>
        <text
          x="268"
          y="420"
          fill="currentColor"
          fontSize="18"
          fontFamily={SERIF}
          transform="rotate(12 268 420)"
          opacity="0.4"
        >
          PV = nRT
        </text>

        {/* ── Biology ── */}
        <text
          x="380"
          y="280"
          fill="currentColor"
          fontSize="14"
          fontFamily={SERIF}
          transform="rotate(-14 380 280)"
          opacity="0.42"
        >
          5′-ATCGGCTA-3′
        </text>

        {/* DNA helix — lower right */}
        <g transform="translate(820 400) rotate(16) scale(1.15)" opacity="0.55">
          <path
            d="M 0 0 Q 14 18 0 36 Q -14 54 0 72 Q 14 90 0 108 Q -14 126 0 144"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M 28 0 Q 42 18 28 36 Q 14 54 28 72 Q 42 90 28 108 Q 14 126 28 144"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
          <line x1="4" y1="18" x2="24" y2="18" stroke="currentColor" strokeWidth="0.75" />
          <line x1="4" y1="54" x2="24" y2="54" stroke="currentColor" strokeWidth="0.75" />
          <line x1="4" y1="90" x2="24" y2="90" stroke="currentColor" strokeWidth="0.75" />
          <line x1="4" y1="126" x2="24" y2="126" stroke="currentColor" strokeWidth="0.75" />
        </g>

        {/* ── Plots & structures (varied scale) ── */}
        {/* Large coordinate plot */}
        <g transform="translate(640 360) scale(1.45)" opacity="0.68">
          <line x1="0" y1="72" x2="148" y2="72" stroke="currentColor" strokeWidth="1.1" />
          <line x1="24" y1="96" x2="24" y2="0" stroke="currentColor" strokeWidth="1.1" />
          <path
            d="M 28 68 C 52 68, 60 12, 88 20 S 124 64, 140 44"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </g>

        {/* Small sine wave */}
        <g transform="translate(520 220) scale(0.62)" opacity="0.52">
          <line x1="0" y1="40" x2="120" y2="40" stroke="currentColor" strokeWidth="0.9" />
          <path
            d="M 0 40 Q 15 8, 30 40 T 60 40 T 90 40 T 120 40"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </g>

        {/* Benzene — medium-large */}
        <g transform="translate(920 200) scale(1.35)" opacity="0.5">
          <polygon
            points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
          <circle cx="0" cy="0" r="9" stroke="currentColor" strokeWidth="0.9" fill="none" />
        </g>

        {/* Tiny vector axes */}
        <g transform="translate(300 560) scale(0.55)" opacity="0.48">
          <line x1="0" y1="40" x2="56" y2="40" stroke="currentColor" strokeWidth="1" />
          <line x1="0" y1="40" x2="0" y2="0" stroke="currentColor" strokeWidth="1" />
          <path d="M 48 40 L 56 40 L 52 36" stroke="currentColor" strokeWidth="1" fill="none" />
          <path d="M 0 8 L 0 0 L 4 4" stroke="currentColor" strokeWidth="1" fill="none" />
        </g>

        {/* Medium jagged plot */}
        <g transform="translate(140 120) scale(1.05)" opacity="0.44">
          <line x1="0" y1="48" x2="88" y2="48" stroke="currentColor" strokeWidth="0.9" />
          <line x1="12" y1="56" x2="12" y2="4" stroke="currentColor" strokeWidth="0.9" />
          <path
            d="M 16 44 L 28 20 L 40 36 L 52 12 L 64 28 L 76 16"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
