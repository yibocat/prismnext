import { ChatHomeBackdropShell } from "./shared";

/** A few paperclips and a bookmark silhouette — quiet desk clutter. */
export function ClipsBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.42] dark:opacity-[0.34]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Paperclip — upper left */}
        <g transform="translate(90 80) rotate(-18)" opacity="0.7">
          <path
            d="M 8 4
               C 8 -6 28 -6 28 4
               L 28 52
               C 28 68 8 68 8 52
               L 8 18
               C 8 10 18 10 18 18
               L 18 46
               C 18 52 12 52 12 46
               L 12 22"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Paperclip — mid right */}
        <g transform="translate(820 260) rotate(22)" opacity="0.55">
          <path
            d="M 6 3
               C 6 -5 22 -5 22 3
               L 22 44
               C 22 58 6 58 6 44
               L 6 16
               C 6 9 15 9 15 16
               L 15 38
               C 15 44 10 44 10 38
               L 10 20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Smaller paperclip — lower mid */}
        <g transform="translate(380 540) rotate(-8)" opacity="0.4">
          <path
            d="M 5 2
               C 5 -4 18 -4 18 2
               L 18 36
               C 18 48 5 48 5 36
               L 5 14
               C 5 8 12 8 12 14
               L 12 32
               C 12 36 8 36 8 32
               L 8 16"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Bookmark ribbon — upper right */}
        <g transform="translate(860 48) rotate(6)" opacity="0.58">
          <path
            d="M 0 0 L 36 0 L 36 110 L 18 92 L 0 110 Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <line
            x1="8"
            y1="18"
            x2="28"
            y2="18"
            stroke="currentColor"
            strokeWidth="0.7"
            opacity="0.7"
          />
          <line
            x1="8"
            y1="28"
            x2="28"
            y2="28"
            stroke="currentColor"
            strokeWidth="0.7"
            opacity="0.55"
          />
        </g>

        {/* Thin bookmark strip — lower left */}
        <g transform="translate(70 480) rotate(-12)" opacity="0.38">
          <path
            d="M 0 0 L 22 0 L 22 86 L 11 72 L 0 86 Z"
            stroke="currentColor"
            strokeWidth="0.95"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
