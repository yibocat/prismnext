import { ChatHomeBackdropShell } from "./shared";

/** Three long shelves spanning the canvas — left / center / right staggered. */
export function BookshelfBackdrop() {
  return (
    <ChatHomeBackdropShell className="text-muted-foreground">
      <svg
        className="h-full w-full opacity-[0.4] dark:opacity-[0.34]"
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top shelf — starts left, runs wide (~18 books) */}
        <g transform="translate(40 68)" opacity="0.62">
          <rect x="0" y="22" width="12" height="78" stroke="currentColor" strokeWidth="0.85" />
          <rect x="16" y="8" width="14" height="92" stroke="currentColor" strokeWidth="0.95" />
          <rect x="34" y="26" width="10" height="74" stroke="currentColor" strokeWidth="0.8" />
          <rect x="48" y="4" width="15" height="96" stroke="currentColor" strokeWidth="0.95" />
          <rect x="67" y="18" width="11" height="82" stroke="currentColor" strokeWidth="0.85" />
          <rect x="82" y="28" width="9" height="72" stroke="currentColor" strokeWidth="0.75" />
          <rect x="95" y="10" width="13" height="90" stroke="currentColor" strokeWidth="0.9" />
          <rect x="112" y="20" width="10" height="80" stroke="currentColor" strokeWidth="0.8" />
          <rect x="126" y="6" width="14" height="94" stroke="currentColor" strokeWidth="0.9" />
          <rect x="144" y="24" width="11" height="76" stroke="currentColor" strokeWidth="0.8" />
          <rect x="159" y="12" width="9" height="88" stroke="currentColor" strokeWidth="0.75" />
          <rect x="172" y="2" width="15" height="98" stroke="currentColor" strokeWidth="0.95" />
          <rect x="191" y="18" width="12" height="82" stroke="currentColor" strokeWidth="0.85" />
          <rect x="207" y="28" width="10" height="72" stroke="currentColor" strokeWidth="0.8" />
          <rect x="221" y="8" width="13" height="92" stroke="currentColor" strokeWidth="0.9" />
          <rect x="238" y="20" width="9" height="80" stroke="currentColor" strokeWidth="0.75" />
          <rect x="251" y="14" width="14" height="86" stroke="currentColor" strokeWidth="0.9" />
          <rect x="269" y="24" width="11" height="76" stroke="currentColor" strokeWidth="0.8" />
          <line x1="4" y1="40" x2="11" y2="40" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="52" y1="32" x2="60" y2="32" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="176" y1="28" x2="185" y2="28" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="254" y1="36" x2="262" y2="36" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="-6" y1="104" x2="290" y2="104" stroke="currentColor" strokeWidth="1.05" />
        </g>

        {/* Middle shelf — centered / slightly right (~18 books) */}
        <g transform="translate(360 278)" opacity="0.5">
          <rect x="0" y="18" width="11" height="72" stroke="currentColor" strokeWidth="0.8" />
          <rect x="15" y="4" width="14" height="86" stroke="currentColor" strokeWidth="0.9" />
          <rect x="33" y="22" width="9" height="68" stroke="currentColor" strokeWidth="0.75" />
          <rect x="46" y="0" width="13" height="90" stroke="currentColor" strokeWidth="0.9" />
          <rect x="63" y="14" width="10" height="76" stroke="currentColor" strokeWidth="0.8" />
          <rect x="77" y="26" width="12" height="64" stroke="currentColor" strokeWidth="0.85" />
          <rect x="93" y="8" width="15" height="82" stroke="currentColor" strokeWidth="0.95" />
          <rect x="112" y="18" width="9" height="72" stroke="currentColor" strokeWidth="0.75" />
          <rect x="125" y="2" width="11" height="88" stroke="currentColor" strokeWidth="0.85" />
          <rect x="140" y="20" width="14" height="70" stroke="currentColor" strokeWidth="0.9" />
          <rect x="158" y="10" width="10" height="80" stroke="currentColor" strokeWidth="0.8" />
          <rect x="172" y="24" width="8" height="66" stroke="currentColor" strokeWidth="0.7" />
          <rect x="184" y="6" width="13" height="84" stroke="currentColor" strokeWidth="0.85" />
          <rect x="201" y="16" width="11" height="74" stroke="currentColor" strokeWidth="0.8" />
          <rect x="216" y="28" width="9" height="62" stroke="currentColor" strokeWidth="0.75" />
          <rect x="229" y="4" width="14" height="86" stroke="currentColor" strokeWidth="0.9" />
          <rect x="247" y="18" width="10" height="72" stroke="currentColor" strokeWidth="0.8" />
          <rect x="261" y="12" width="12" height="78" stroke="currentColor" strokeWidth="0.85" />
          <line x1="18" y1="30" x2="26" y2="30" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="98" y1="36" x2="106" y2="36" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="188" y1="32" x2="195" y2="32" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="250" y1="40" x2="258" y2="40" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="-6" y1="94" x2="282" y2="94" stroke="currentColor" strokeWidth="1" />
        </g>

        {/* Bottom shelf — shifted right (~17 books) */}
        <g transform="translate(520 500)" opacity="0.48">
          <rect x="0" y="20" width="12" height="74" stroke="currentColor" strokeWidth="0.85" />
          <rect x="16" y="6" width="10" height="88" stroke="currentColor" strokeWidth="0.9" />
          <rect x="30" y="24" width="14" height="70" stroke="currentColor" strokeWidth="0.85" />
          <rect x="48" y="10" width="9" height="84" stroke="currentColor" strokeWidth="0.75" />
          <rect x="61" y="2" width="15" height="92" stroke="currentColor" strokeWidth="0.95" />
          <rect x="80" y="18" width="11" height="76" stroke="currentColor" strokeWidth="0.8" />
          <rect x="95" y="28" width="8" height="66" stroke="currentColor" strokeWidth="0.7" />
          <rect x="107" y="8" width="13" height="86" stroke="currentColor" strokeWidth="0.9" />
          <rect x="124" y="16" width="10" height="78" stroke="currentColor" strokeWidth="0.8" />
          <rect x="138" y="4" width="14" height="90" stroke="currentColor" strokeWidth="0.9" />
          <rect x="156" y="22" width="9" height="72" stroke="currentColor" strokeWidth="0.75" />
          <rect x="169" y="12" width="12" height="82" stroke="currentColor" strokeWidth="0.85" />
          <rect x="185" y="26" width="10" height="68" stroke="currentColor" strokeWidth="0.8" />
          <rect x="199" y="0" width="13" height="94" stroke="currentColor" strokeWidth="0.9" />
          <rect x="216" y="14" width="11" height="80" stroke="currentColor" strokeWidth="0.85" />
          <rect x="231" y="22" width="9" height="72" stroke="currentColor" strokeWidth="0.75" />
          <rect x="244" y="8" width="14" height="86" stroke="currentColor" strokeWidth="0.9" />
          <line x1="64" y1="30" x2="73" y2="30" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="142" y1="34" x2="150" y2="34" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="220" y1="36" x2="228" y2="36" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
          <line x1="-6" y1="98" x2="268" y2="98" stroke="currentColor" strokeWidth="1" />
        </g>
      </svg>
    </ChatHomeBackdropShell>
  );
}
