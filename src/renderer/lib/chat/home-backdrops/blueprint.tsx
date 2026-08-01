import { ChatHomeBackdropShell } from "./shared";

/** Technical blueprint motifs — dashed guides, ticks, frames. Default for Graphite. */
export function BlueprintBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.36] dark:opacity-[0.28]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Large dashed frame — upper right */}
        <rect
          x="680"
          y="48"
          width="260"
          height="168"
          rx="10"
          stroke="currentColor"
          strokeWidth="0.9"
          strokeDasharray="10 6"
          opacity="0.5"
        />
        <line
          x1="680"
          y1="132"
          x2="940"
          y2="132"
          stroke="currentColor"
          strokeWidth="0.55"
          strokeDasharray="4 5"
          opacity="0.35"
        />
        <line
          x1="810"
          y1="48"
          x2="810"
          y2="216"
          stroke="currentColor"
          strokeWidth="0.55"
          strokeDasharray="4 5"
          opacity="0.35"
        />

        {/* Dimension line — top */}
        <g transform="translate(120 88)" opacity="0.48">
          <line x1="0" y1="0" x2="220" y2="0" stroke="currentColor" strokeWidth="0.75" />
          <line x1="0" y1="-6" x2="0" y2="6" stroke="currentColor" strokeWidth="0.75" />
          <line x1="220" y1="-6" x2="220" y2="6" stroke="currentColor" strokeWidth="0.75" />
          <line
            x1="110"
            y1="-4"
            x2="110"
            y2="4"
            stroke="currentColor"
            strokeWidth="0.6"
            strokeDasharray="2 3"
          />
        </g>

        {/* Crosshair circle — left */}
        <g transform="translate(168 380)" opacity="0.42">
          <circle cx="0" cy="0" r="52" stroke="currentColor" strokeWidth="0.85" />
          <circle cx="0" cy="0" r="28" stroke="currentColor" strokeWidth="0.65" strokeDasharray="5 4" />
          <line x1="-64" y1="0" x2="64" y2="0" stroke="currentColor" strokeWidth="0.6" strokeDasharray="4 4" />
          <line x1="0" y1="-64" x2="0" y2="64" stroke="currentColor" strokeWidth="0.6" strokeDasharray="4 4" />
        </g>

        {/* Rounded panel — lower left */}
        <g transform="translate(72 520) rotate(-4)" opacity="0.4">
          <rect
            x="0"
            y="0"
            width="200"
            height="120"
            rx="14"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeDasharray="9 5"
          />
          <rect
            x="24"
            y="24"
            width="152"
            height="72"
            rx="8"
            stroke="currentColor"
            strokeWidth="0.65"
            strokeDasharray="6 4"
            opacity="0.75"
          />
        </g>

        {/* Diagonal construction guides — center-right */}
        <g opacity="0.32">
          <line
            x1="520"
            y1="180"
            x2="720"
            y2="380"
            stroke="currentColor"
            strokeWidth="0.65"
            strokeDasharray="7 5"
          />
          <line
            x1="720"
            y1="180"
            x2="520"
            y2="380"
            stroke="currentColor"
            strokeWidth="0.65"
            strokeDasharray="7 5"
          />
        </g>

        {/* Crop-corner brackets — bottom right */}
        <g transform="translate(860 580)" opacity="0.45">
          <path d="M 0 28 L 0 0 L 28 0" stroke="currentColor" strokeWidth="0.85" fill="none" />
          <path d="M 80 0 L 108 0 L 108 28" stroke="currentColor" strokeWidth="0.85" fill="none" />
          <path d="M 108 72 L 108 100 L 80 100" stroke="currentColor" strokeWidth="0.85" fill="none" />
          <path d="M 28 100 L 0 100 L 0 72" stroke="currentColor" strokeWidth="0.85" fill="none" />
        </g>

        {/* Small hex outline — upper center */}
        <g transform="translate(480 120) rotate(12)" opacity="0.38">
          <polygon
            points="0,-24 21,-12 21,12 0,24 -21,12 -21,-12"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="6 4"
          />
        </g>

        {/* Vertical dimension — right edge */}
        <g transform="translate(928 280)" opacity="0.4">
          <line x1="0" y1="0" x2="0" y2="160" stroke="currentColor" strokeWidth="0.7" />
          <line x1="-5" y1="0" x2="5" y2="0" stroke="currentColor" strokeWidth="0.7" />
          <line x1="-5" y1="160" x2="5" y2="160" stroke="currentColor" strokeWidth="0.7" />
        </g>

        {/* Horizontal guide band */}
        <line
          x1="40"
          y1="248"
          x2="420"
          y2="248"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeDasharray="12 7"
          opacity="0.3"
        />
        <line
          x1="560"
          y1="620"
          x2="960"
          y2="620"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeDasharray="12 7"
          opacity="0.28"
        />
      </svg>
    </ChatHomeBackdropShell>
  );
}
