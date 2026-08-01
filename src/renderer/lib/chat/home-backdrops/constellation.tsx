import { ChatHomeBackdropShell } from "./shared";

/** Constellation line art — dots linked by thin strokes, no twinkle. */
export function ConstellationBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.4] dark:opacity-[0.32]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Orion-ish cluster — upper left */}
        <g opacity="0.58">
          <path
            d="M 120 90 L 160 120 L 200 85 L 240 110 L 280 70"
            stroke="currentColor"
            strokeWidth="0.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 160 120 L 180 160 L 220 150"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeLinecap="round"
            opacity="0.75"
          />
          <circle cx="120" cy="90" r="2.8" fill="currentColor" />
          <circle cx="160" cy="120" r="2.2" fill="currentColor" />
          <circle cx="200" cy="85" r="3" fill="currentColor" />
          <circle cx="240" cy="110" r="2.4" fill="currentColor" />
          <circle cx="280" cy="70" r="2.6" fill="currentColor" />
          <circle cx="180" cy="160" r="2" fill="currentColor" opacity="0.8" />
          <circle cx="220" cy="150" r="2.2" fill="currentColor" opacity="0.8" />
        </g>

        {/* Cassiopeia W — upper right */}
        <g opacity="0.48">
          <path
            d="M 680 100 L 720 140 L 760 95 L 800 130 L 840 88"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="680" cy="100" r="2.4" fill="currentColor" />
          <circle cx="720" cy="140" r="2.8" fill="currentColor" />
          <circle cx="760" cy="95" r="2.2" fill="currentColor" />
          <circle cx="800" cy="130" r="2.6" fill="currentColor" />
          <circle cx="840" cy="88" r="2.4" fill="currentColor" />
        </g>

        {/* Small triangle — mid */}
        <g opacity="0.38">
          <path
            d="M 480 280 L 520 320 L 440 310 Z"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
          <circle cx="480" cy="280" r="2" fill="currentColor" />
          <circle cx="520" cy="320" r="2.2" fill="currentColor" />
          <circle cx="440" cy="310" r="1.8" fill="currentColor" />
        </g>

        {/* Lower arc — bottom */}
        <g opacity="0.42">
          <path
            d="M 200 520 L 260 480 L 320 510 L 380 470 L 440 500"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <circle cx="200" cy="520" r="2.2" fill="currentColor" />
          <circle cx="260" cy="480" r="2.6" fill="currentColor" />
          <circle cx="320" cy="510" r="2" fill="currentColor" />
          <circle cx="380" cy="470" r="2.4" fill="currentColor" />
          <circle cx="440" cy="500" r="2.2" fill="currentColor" />
        </g>

        {/* Lone distant pair */}
        <g opacity="0.28">
          <line x1="860" y1="480" x2="900" y2="520" stroke="currentColor" strokeWidth="0.7" />
          <circle cx="860" cy="480" r="1.8" fill="currentColor" />
          <circle cx="900" cy="520" r="1.6" fill="currentColor" />
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
