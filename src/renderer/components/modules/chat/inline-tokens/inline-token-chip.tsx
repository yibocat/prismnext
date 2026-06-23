import type { ReactNode } from "react";
import { BotIcon, FileTextIcon, GlobeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InlineTokenVariant } from "./variants";
import { inlineTokenClassName } from "./styles";

export interface InlineTokenChipProps {
  variant: InlineTokenVariant;
  label: string;
  /** Visible prefix before label (@ / /) — link omits prefix */
  prefix?: "@" | "/" | "";
  icon?: ReactNode;
  title?: string;
  onClick?: () => void;
  /** Composer / CodeMirror widgets */
  asToken?: boolean;
  className?: string;
}

const DEFAULT_ICONS: Partial<Record<InlineTokenVariant, ReactNode>> = {
  file: <FileTextIcon className="size-3 shrink-0 opacity-70" />,
  profile: <BotIcon className="size-3 shrink-0 opacity-70" />,
  link: <GlobeIcon className="size-3 shrink-0 opacity-80" />,
};

/**
 * Shared inline token chip — composer, user bubble, AI reply markdown.
 * Uses bg-muted / text-muted-foreground (gray) + theme accent on link hover.
 */
export function InlineTokenChip({
  variant,
  label,
  prefix = "",
  icon,
  title,
  onClick,
  asToken = false,
  className,
}: InlineTokenChipProps) {
  const Tag = onClick ? "button" : "span";
  const resolvedIcon = icon ?? DEFAULT_ICONS[variant];

  return (
    <Tag
      type={onClick ? "button" : undefined}
      title={title ?? label}
      contentEditable={asToken ? false : undefined}
      data-inline-token={variant}
      className={cn(inlineTokenClassName(variant, className))}
      onClick={onClick}
    >
      {resolvedIcon}
      <span className="truncate">
        {prefix}
        {label}
      </span>
    </Tag>
  );
}
