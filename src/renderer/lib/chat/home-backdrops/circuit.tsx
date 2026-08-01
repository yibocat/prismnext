import { ChatHomeBackdropShell } from "./shared";

/** PCB-style trace routing — sparse pads and orthogonal runs. */
export function CircuitBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.34] dark:opacity-[0.28]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Upper-left block */}
        <g opacity="0.7">
          <path
            d="M 60 80 H 180 V 140 H 240 V 200 H 160 V 260 H 100 V 200 H 60 Z"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="60" cy="80" r="3.2" fill="currentColor" />
          <circle cx="180" cy="80" r="2.6" fill="currentColor" />
          <circle cx="240" cy="140" r="2.6" fill="currentColor" />
          <circle cx="160" cy="260" r="3" fill="currentColor" />
          <circle cx="100" cy="200" r="2.4" fill="currentColor" />
        </g>

        {/* Mid horizontal bus */}
        <g opacity="0.55">
          <path
            d="M 280 180 H 420 V 120 H 520 V 220 H 620 V 160 H 740"
            stroke="currentColor"
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
          <circle cx="280" cy="180" r="2.8" fill="currentColor" />
          <circle cx="420" cy="180" r="2.4" fill="currentColor" />
          <circle cx="520" cy="120" r="2.4" fill="currentColor" />
          <circle cx="620" cy="220" r="2.6" fill="currentColor" />
          <circle cx="740" cy="160" r="3" fill="currentColor" />
        </g>

        {/* Chip footprint — upper right */}
        <g transform="translate(780 72)" opacity="0.62">
          <rect
            x="0"
            y="0"
            width="140"
            height="96"
            rx="4"
            stroke="currentColor"
            strokeWidth="1"
          />
          <rect
            x="28"
            y="22"
            width="84"
            height="52"
            rx="2"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="4 3"
          />
          {/* pins */}
          <path d="M 18 0 V -16 M 42 0 V -16 M 66 0 V -16 M 90 0 V -16 M 114 0 V -16" stroke="currentColor" strokeWidth="0.85" />
          <path d="M 18 96 V 112 M 42 96 V 112 M 66 96 V 112 M 90 96 V 112 M 114 96 V 112" stroke="currentColor" strokeWidth="0.85" />
          <circle cx="18" cy="-16" r="2.2" fill="currentColor" />
          <circle cx="114" cy="112" r="2.2" fill="currentColor" />
        </g>

        {/* Lower-left vias + traces */}
        <g opacity="0.5">
          <path
            d="M 80 420 H 200 V 500 H 320 V 460 H 400"
            stroke="currentColor"
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
          <circle cx="80" cy="420" r="5" stroke="currentColor" strokeWidth="0.85" fill="none" />
          <circle cx="80" cy="420" r="2" fill="currentColor" />
          <circle cx="200" cy="420" r="2.4" fill="currentColor" />
          <circle cx="320" cy="500" r="2.6" fill="currentColor" />
          <circle cx="400" cy="460" r="2.4" fill="currentColor" />
        </g>

        {/* Right vertical stack */}
        <g opacity="0.48">
          <path
            d="M 860 280 V 360 H 920 V 440 H 840 V 520 H 900 V 580"
            stroke="currentColor"
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
          <circle cx="860" cy="280" r="2.6" fill="currentColor" />
          <circle cx="920" cy="360" r="2.4" fill="currentColor" />
          <circle cx="840" cy="440" r="2.4" fill="currentColor" />
          <circle cx="900" cy="580" r="3" fill="currentColor" />
        </g>

        {/* Bottom bus with pads */}
        <g opacity="0.45">
          <path
            d="M 120 620 H 280 V 580 H 460 V 640 H 640 V 600 H 780"
            stroke="currentColor"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <circle cx="120" cy="620" r="2.4" fill="currentColor" />
          <circle cx="280" cy="620" r="2.2" fill="currentColor" />
          <circle cx="460" cy="580" r="2.4" fill="currentColor" />
          <circle cx="640" cy="640" r="2.6" fill="currentColor" />
          <circle cx="780" cy="600" r="2.4" fill="currentColor" />
        </g>

        {/* Small IC island mid */}
        <g transform="translate(480 300)" opacity="0.42">
          <rect x="0" y="0" width="72" height="48" rx="3" stroke="currentColor" strokeWidth="0.85" />
          <path d="M 12 0 V -12 M 36 0 V -12 M 60 0 V -12" stroke="currentColor" strokeWidth="0.75" />
          <path d="M 12 48 V 60 M 36 48 V 60 M 60 48 V 60" stroke="currentColor" strokeWidth="0.75" />
          <path d="M 72 16 H 100 V 40 H 120" stroke="currentColor" strokeWidth="0.8" />
          <circle cx="120" cy="40" r="2.4" fill="currentColor" />
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
