import type { ReactNode } from "react";
import { XIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

/**
 * Shared density for composer toolbar status chips (next to +).
 * Matches ModelThoughtSelect trigger: meta font, py-1, no border — not h-7 bordered pills.
 */
export const COMPOSER_STATUS_CHIP =
  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 " +
  "text-[length:var(--font-chat-meta)] text-muted-foreground " +
  "bg-muted";

export const COMPOSER_STATUS_CHIP_DISMISS =
  "rounded-sm p-0.5 text-muted-foreground/80 transition-colors " +
  "hover:bg-muted hover:text-foreground";

type ComposerStatusChipProps = {
  label: string;
  icon?: ReactNode;
  hint?: string;
  onDismiss?: () => void;
  dismissAriaLabel?: string;
  className?: string;
};

/** Reusable status chip for composer toolbar (+ side): icon + label + optional dismiss. */
export function ComposerStatusChip({
  label,
  icon,
  hint,
  onDismiss,
  dismissAriaLabel,
  className,
}: ComposerStatusChipProps) {
  const chip = (
    <span className={cn(COMPOSER_STATUS_CHIP, className)}>
      {icon}
      <span className="max-w-[8rem] truncate font-medium text-foreground/90">{label}</span>
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissAriaLabel ?? "Dismiss"}
          className={COMPOSER_STATUS_CHIP_DISMISS}
          onClick={onDismiss}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );

  if (hint) {
    return <Hint label={hint}>{chip}</Hint>;
  }
  return chip;
}
