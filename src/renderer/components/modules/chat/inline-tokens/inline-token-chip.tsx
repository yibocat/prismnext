import type { MouseEvent, ReactNode } from "react";
import {
  BotIcon,
  Code2Icon,
  FileDiffIcon,
  FileTextIcon,
  GlobeIcon,
  PlugIcon,
  PuzzleIcon,
  SlashIcon,
  TerminalIcon,
  ZapIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InlineTokenVariant } from "./variants";
import { INLINE_TOKEN_CLICKABLE, inlineTokenClassName } from "./styles";

export interface InlineTokenChipProps {
  variant: InlineTokenVariant;
  label: string;
  /** Visible prefix before label (@ / /) — link omits prefix */
  prefix?: "@" | "/" | "";
  icon?: ReactNode;
  /** Trailing meta (e.g. git diff +/− counts) */
  suffix?: ReactNode;
  title?: string;
  onClick?: () => void;
  /** Composer / CodeMirror widgets */
  asToken?: boolean;
  className?: string;
}

const DEFAULT_ICONS: Partial<Record<InlineTokenVariant, ReactNode>> = {
  profile: <BotIcon className="size-[0.85em] shrink-0" />,
  command: <SlashIcon className="size-[0.85em] shrink-0" />,
  "command-action": <ZapIcon className="size-[0.85em] shrink-0" />,
  skill: <PuzzleIcon className="size-[0.85em] shrink-0" />,
  mcp: <PlugIcon className="size-[0.85em] shrink-0" />,
  link: <GlobeIcon className="size-[0.85em] shrink-0" />,
  terminal: <TerminalIcon className="size-[0.85em] shrink-0" />,
  code: <Code2Icon className="size-[0.85em] shrink-0" />,
  "code-git": <FileDiffIcon className="size-[0.85em] shrink-0" />,
  literature: <FileTextIcon className="size-[0.85em] shrink-0" />,
};

/**
 * Shared inline token chip — composer, user bubble, AI reply markdown.
 * Each variant uses a distinct tint (see styles.ts).
 */
export function InlineTokenChip({
  variant,
  label,
  prefix = "",
  icon,
  suffix,
  title,
  onClick,
  asToken = false,
  className,
}: InlineTokenChipProps) {
  const Tag = onClick ? "button" : "span";
  const resolvedIcon = icon ?? DEFAULT_ICONS[variant];

  const handleClick = onClick
    ? (e: MouseEvent) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;

  return (
    <Tag
      type={onClick ? "button" : undefined}
      title={title ?? label}
      contentEditable={asToken ? false : undefined}
      data-inline-token={variant}
      className={cn(
        inlineTokenClassName(variant, className),
        onClick && INLINE_TOKEN_CLICKABLE,
      )}
      onClick={handleClick}
      onMouseDown={
        onClick
          ? (e) => {
              e.preventDefault();
            }
          : undefined
      }
    >
      {resolvedIcon}
      <span className="inline min-w-0 truncate leading-[inherit]">
        {prefix}
        {label}
      </span>
      {suffix}
    </Tag>
  );
}
