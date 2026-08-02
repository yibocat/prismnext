import { cn } from "@/lib/utils";
import type { InlineTokenVariant } from "./variants";

/** Colored inline token text — inherits composer/body font; hover underline when clickable. */
function textToken(
  text: string,
  icon: string,
  extra?: string,
): string {
  return cn(
    "inline-flex max-w-[14rem] items-baseline align-baseline font-inherit cursor-pointer",
    "text-[length:inherit] leading-[inherit] gap-[0.15em]",
    "[&_svg]:inline-block [&_svg]:align-[-0.1em] [&_svg]:shrink-0",
    text,
    icon,
    extra,
  );
}

export const INLINE_TOKEN_CLICKABLE =
  "cursor-pointer hover:underline decoration-current underline-offset-2";

const LINK_TOKEN = cn(
  "inline-flex max-w-[14rem] items-baseline align-baseline font-inherit",
  "text-[length:inherit] leading-[inherit] gap-[0.15em] font-medium",
  INLINE_TOKEN_CLICKABLE,
  "[&_svg]:inline-block [&_svg]:align-[-0.1em] [&_svg]:shrink-0",
  "text-emerald-800 dark:text-emerald-300",
  "[&_svg]:text-emerald-600 dark:[&_svg]:text-emerald-400",
  "hover:text-emerald-900 dark:hover:text-emerald-200",
);

const VARIANT_CLASS: Record<InlineTokenVariant, string> = {
  file: textToken(
    "text-sky-800 dark:text-sky-300",
    "[&_svg]:text-sky-600 dark:[&_svg]:text-sky-400",
  ),
  profile: textToken(
    "text-violet-800 dark:text-violet-300",
    "[&_svg]:text-violet-600 dark:[&_svg]:text-violet-400",
    "font-medium",
  ),
  command: textToken(
    "text-amber-900 dark:text-amber-300",
    "[&_svg]:text-amber-700 dark:[&_svg]:text-amber-400",
    "font-medium",
  ),
  "command-action": textToken(
    "text-orange-900 dark:text-orange-300",
    "[&_svg]:text-orange-700 dark:[&_svg]:text-orange-400",
    "font-medium",
  ),
  skill: textToken(
    "text-fuchsia-800 dark:text-fuchsia-300",
    "[&_svg]:text-fuchsia-600 dark:[&_svg]:text-fuchsia-400",
    "font-medium",
  ),
  mcp: textToken(
    "text-cyan-800 dark:text-cyan-300",
    "[&_svg]:text-cyan-600 dark:[&_svg]:text-cyan-400",
    "font-medium",
  ),
  link: LINK_TOKEN,
  terminal: textToken(
    "text-stone-800 dark:text-stone-300",
    "[&_svg]:text-stone-600 dark:[&_svg]:text-stone-400",
    "font-medium",
  ),
  code: textToken(
    "text-emerald-900 dark:text-emerald-300",
    "[&_svg]:text-emerald-700 dark:[&_svg]:text-emerald-400",
    "font-medium",
  ),
  "code-git": textToken(
    "text-teal-900 dark:text-teal-300",
    "[&_svg]:text-teal-700 dark:[&_svg]:text-teal-400",
    "font-medium",
  ),
  "git-diff": textToken(
    "text-rose-900 dark:text-rose-300",
    "[&_svg]:text-rose-700 dark:[&_svg]:text-rose-400",
    "font-medium",
  ),
  literature: textToken(
    "text-indigo-900 dark:text-indigo-300",
    "[&_svg]:text-indigo-700 dark:[&_svg]:text-indigo-400",
    "font-medium hover:text-indigo-950 dark:hover:text-indigo-200",
  ),
};

export function inlineTokenClassName(
  variant: InlineTokenVariant,
  className?: string,
): string {
  return cn(VARIANT_CLASS[variant], className);
}
