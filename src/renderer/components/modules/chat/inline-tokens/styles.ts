import { cn } from "@/lib/utils";
import type { InlineTokenVariant } from "./variants";

const SHELL = cn(
  "inline-flex items-center gap-0.5 rounded-md px-1 py-0 mx-px align-middle leading-none",
  "text-[length:var(--font-chat-meta)] max-w-[14rem] border",
);

/** Tinted chip — one hue per semantic category (@file, @agent, /slash, snippets, link). */
function tint(
  bg: string,
  text: string,
  border: string,
  icon: string,
  extra?: string,
): string {
  return cn(SHELL, bg, text, border, icon, extra);
}

const VARIANT_CLASS: Record<InlineTokenVariant, string> = {
  file: tint(
    "bg-sky-500/12 dark:bg-sky-500/15",
    "text-sky-900 dark:text-sky-100",
    "border-sky-500/25",
    "[&_svg]:text-sky-600 dark:[&_svg]:text-sky-300",
    "font-mono",
  ),
  profile: tint(
    "bg-violet-500/12 dark:bg-violet-500/15",
    "text-violet-900 dark:text-violet-100",
    "border-violet-500/25",
    "[&_svg]:text-violet-600 dark:[&_svg]:text-violet-300",
    "font-medium",
  ),
  command: tint(
    "bg-amber-500/12 dark:bg-amber-500/15",
    "text-amber-950 dark:text-amber-50",
    "border-amber-500/30",
    "[&_svg]:text-amber-700 dark:[&_svg]:text-amber-300",
    "font-mono font-medium",
  ),
  "command-action": tint(
    "bg-orange-500/14 dark:bg-orange-500/18",
    "text-orange-950 dark:text-orange-50",
    "border-orange-500/35",
    "[&_svg]:text-orange-700 dark:[&_svg]:text-orange-300",
    "font-mono font-medium ring-1 ring-orange-500/15",
  ),
  skill: tint(
    "bg-fuchsia-500/12 dark:bg-fuchsia-500/15",
    "text-fuchsia-900 dark:text-fuchsia-100",
    "border-fuchsia-500/25",
    "[&_svg]:text-fuchsia-600 dark:[&_svg]:text-fuchsia-300",
    "font-mono font-medium",
  ),
  mcp: tint(
    "bg-cyan-500/12 dark:bg-cyan-500/15",
    "text-cyan-900 dark:text-cyan-100",
    "border-cyan-500/25",
    "[&_svg]:text-cyan-600 dark:[&_svg]:text-cyan-300",
    "font-mono font-medium",
  ),
  link: cn(
    SHELL,
    "font-medium cursor-pointer transition-colors",
    "bg-emerald-500/10 dark:bg-emerald-500/14",
    "text-emerald-900 dark:text-emerald-100",
    "border-emerald-500/25",
    "[&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-300",
    "hover:bg-emerald-500/18 hover:border-emerald-500/40",
  ),
  terminal: tint(
    "bg-stone-500/14 dark:bg-stone-400/12",
    "text-stone-900 dark:text-stone-100",
    "border-stone-500/30",
    "[&_svg]:text-stone-600 dark:[&_svg]:text-stone-300",
    "font-mono font-medium",
  ),
  code: tint(
    "bg-emerald-500/12 dark:bg-emerald-500/15",
    "text-emerald-950 dark:text-emerald-50",
    "border-emerald-500/28",
    "[&_svg]:text-emerald-700 dark:[&_svg]:text-emerald-300",
    "font-mono font-medium",
  ),
  "code-git": tint(
    "bg-teal-500/12 dark:bg-teal-500/15",
    "text-teal-950 dark:text-teal-50",
    "border-teal-500/28",
    "[&_svg]:text-teal-700 dark:[&_svg]:text-teal-300",
    "font-mono font-medium",
  ),
  "git-diff": tint(
    "bg-rose-500/12 dark:bg-rose-500/15",
    "text-rose-950 dark:text-rose-50",
    "border-rose-500/28",
    "[&_svg]:text-rose-700 dark:[&_svg]:text-rose-300",
    "font-mono font-medium",
  ),
  literature: tint(
    "bg-indigo-500/12 dark:bg-indigo-500/15",
    "text-indigo-950 dark:text-indigo-50",
    "border-indigo-500/28",
    "[&_svg]:text-indigo-700 dark:[&_svg]:text-indigo-300",
    "font-mono font-medium cursor-pointer",
    "hover:bg-indigo-500/18 hover:border-indigo-500/40",
  ),
};

export function inlineTokenClassName(
  variant: InlineTokenVariant,
  className?: string,
): string {
  return cn(VARIANT_CLASS[variant], className);
}
