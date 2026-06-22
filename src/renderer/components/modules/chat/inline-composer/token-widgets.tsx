import { BotIcon, FileTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComposerPart } from "./tokens";

export function TokenChip({ part }: { part: Exclude<ComposerPart, { type: "text" }> }) {
  if (part.type === "mention" && part.mentionType === "file") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded px-1 py-px mx-px",
          "bg-muted text-muted-foreground font-mono text-[length:var(--font-chat-meta)]",
          "align-baseline leading-snug",
        )}
        contentEditable={false}
      >
        <FileTextIcon className="size-3 shrink-0 opacity-70" />
        <span className="max-w-[10rem] truncate">@{part.label}</span>
      </span>
    );
  }

  if (part.type === "mention" && part.mentionType === "profile") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded px-1 py-px mx-px",
          "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
          "text-[length:var(--font-chat-meta)] font-medium align-baseline leading-snug",
        )}
        contentEditable={false}
      >
        <BotIcon className="size-3 shrink-0" />
        <span className="max-w-[10rem] truncate">@{part.label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px mx-px font-mono font-medium",
        "text-[length:var(--font-chat-meta)] align-baseline leading-snug",
        part.action
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      )}
      contentEditable={false}
    >
      /{part.label}
    </span>
  );
}

export function InlineMessageParts({ parts }: { parts: ComposerPart[] }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={`t-${i}`}>{part.text}</span>;
        }
        return <TokenChip key={part.id} part={part} />;
      })}
    </span>
  );
}
