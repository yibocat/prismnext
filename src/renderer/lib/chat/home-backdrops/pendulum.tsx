import { ChatHomeBackdropShell } from "./shared";

/** Slow pendulum + faint hourglass outline — quiet "thinking" mood. */
export function PendulumBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <style>{`
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
      `}</style>
      <svg
        className="h-full w-full opacity-[0.42] dark:opacity-[0.34]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Pendulum — upper right */}
        <g transform="translate(820 90)" opacity="0.65">
          <circle cx="0" cy="0" r="3" fill="currentColor" opacity="0.7" />
          <g className="prism-pendulum-arm">
            <line x1="0" y1="0" x2="0" y2="120" stroke="currentColor" strokeWidth="0.95" />
            <circle cx="0" cy="120" r="10" stroke="currentColor" strokeWidth="1.1" />
            <circle cx="0" cy="120" r="3.5" fill="currentColor" opacity="0.5" />
          </g>
        </g>

        {/* Hourglass outline — lower left */}
        <g transform="translate(120 480) rotate(-8)" opacity="0.45">
          <path
            d="M -28 -52 L 28 -52 L 8 0 L 28 52 L -28 52 L -8 0 Z"
            stroke="currentColor"
            strokeWidth="1.05"
            strokeLinejoin="round"
          />
          <line x1="-18" y1="-32" x2="18" y2="-32" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
          <line x1="-12" y1="32" x2="12" y2="32" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
          <path
            d="M -4 0 L 4 0"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        </g>

        {/* Second tiny hourglass — mid right, very faint */}
        <g transform="translate(720 560) rotate(6)" opacity="0.28">
          <path
            d="M -18 -34 L 18 -34 L 5 0 L 18 34 L -18 34 L -5 0 Z"
            stroke="currentColor"
            strokeWidth="0.85"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
