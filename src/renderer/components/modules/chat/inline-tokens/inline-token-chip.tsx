import type { ReactNode } from "react";
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
import { inlineTokenClassName } from "./styles";

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
  file: <FileTextIcon className="size-3 shrink-0" />,
  profile: <BotIcon className="size-3 shrink-0" />,
  command: <SlashIcon className="size-3 shrink-0" />,
  "command-action": <ZapIcon className="size-3 shrink-0" />,
  skill: <PuzzleIcon className="size-3 shrink-0" />,
  mcp: <PlugIcon className="size-3 shrink-0" />,
  link: <GlobeIcon className="size-3 shrink-0" />,
  terminal: <TerminalIcon className="size-3 shrink-0" />,
  code: <Code2Icon className="size-3 shrink-0" />,
  "code-git": <FileDiffIcon className="size-3 shrink-0" />,
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
      <span className="min-w-0 truncate">
        {prefix}
        {label}
      </span>
      {suffix}
    </Tag>
  );
}
