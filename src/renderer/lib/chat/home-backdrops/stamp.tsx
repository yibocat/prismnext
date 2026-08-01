import { ChatHomeBackdropShell } from "./shared";

/** Desk rubber stamps / postmarks in a few corners — quiet DRAFT motif. */
export function StampBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.48] dark:opacity-[0.4]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main DRAFT — upper right */}
        <g transform="translate(800 110) rotate(12)" opacity="0.72">
          <circle
            cx="0"
            cy="0"
            r="78"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <circle cx="0" cy="0" r="62" stroke="currentColor" strokeWidth="0.9" opacity="0.75" />
          <text
            x="0"
            y="9"
            textAnchor="middle"
            fill="currentColor"
            fontSize="24"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="3.5"
          >
            DRAFT
          </text>
          <text
            x="0"
            y="-30"
            textAnchor="middle"
            fill="currentColor"
            fontSize="10"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            opacity="0.8"
            letterSpacing="2"
          >
            PRISM
          </text>
          <text
            x="0"
            y="38"
            textAnchor="middle"
            fill="currentColor"
            fontSize="9"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            opacity="0.7"
            letterSpacing="1.2"
          >
            REVIEW
          </text>
        </g>

        {/* Rectangular NOTE — lower left */}
        <g transform="translate(150 540) rotate(-9)" opacity="0.58">
          <rect
            x="-56"
            y="-32"
            width="112"
            height="64"
            rx="5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
          <text
            x="0"
            y="-2"
            textAnchor="middle"
            fill="currentColor"
            fontSize="14"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="2"
          >
            NOTE
          </text>
          <line
            x1="-36"
            y1="12"
            x2="36"
            y2="12"
            stroke="currentColor"
            strokeWidth="0.8"
            opacity="0.65"
          />
          <text
            x="0"
            y="26"
            textAnchor="middle"
            fill="currentColor"
            fontSize="9"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            opacity="0.75"
          >
            · · ·
          </text>
        </g>

        {/* Round OK — mid left */}
        <g transform="translate(110 250) rotate(8)" opacity="0.5">
          <circle cx="0" cy="0" r="36" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 3" />
          <circle cx="0" cy="0" r="26" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />
          <text
            x="0"
            y="6"
            textAnchor="middle"
            fill="currentColor"
            fontSize="14"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="1"
          >
            OK
          </text>
        </g>

        {/* Small WIP oval — lower right */}
        <g transform="translate(820 560) rotate(-6)" opacity="0.45">
          <ellipse
            cx="0"
            cy="0"
            rx="52"
            ry="28"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeDasharray="4 3"
          />
          <text
            x="0"
            y="5"
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="2"
          >
            WIP
          </text>
        </g>

        {/* Tiny CHECK — upper mid-left */}
        <g transform="translate(320 80) rotate(-14)" opacity="0.38">
          <rect
            x="-40"
            y="-18"
            width="80"
            height="36"
            rx="3"
            stroke="currentColor"
            strokeWidth="0.95"
            strokeDasharray="3 2.5"
          />
          <text
            x="0"
            y="5"
            textAnchor="middle"
            fill="currentColor"
            fontSize="11"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="600"
            letterSpacing="1.5"
          >
            CHECK
          </text>
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
