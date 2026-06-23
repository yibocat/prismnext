import { cn } from "@/lib/utils";
import type { InlineTokenVariant } from "./variants";

const BASE = cn(
  "inline-flex items-center gap-0.5 rounded px-1 py-px mx-px align-baseline leading-snug",
  "text-[length:var(--font-chat-meta)] max-w-[14rem]",
  /* Gray label + theme surface — follows Appearance-injected --muted / --accent */
  "bg-muted text-muted-foreground",
  "[&_svg]:text-muted-foreground",
);

const VARIANT_CLASS: Record<InlineTokenVariant, string> = {
  file: cn(BASE, "font-mono"),
  profile: cn(BASE, "font-medium"),
  command: cn(BASE, "font-mono font-medium"),
  "command-action": cn(BASE, "font-mono font-medium"),
  link: cn(
    BASE,
    "font-medium cursor-pointer transition-colors",
    "hover:bg-accent hover:text-accent-foreground",
    "hover:[&_svg]:text-accent-foreground",
  ),
  terminal: cn(BASE, "font-mono font-medium text-primary/90"),
};

export function inlineTokenClassName(
  variant: InlineTokenVariant,
  className?: string,
): string {
  return cn(VARIANT_CLASS[variant], className);
}
