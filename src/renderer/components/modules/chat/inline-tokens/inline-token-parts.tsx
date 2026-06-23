import type { ComposerPart } from "@/lib/chat/composer-parts";
import { TerminalIcon } from "lucide-react";
import { InlineTokenChip } from "./inline-token-chip";
import { openUrlInBrowser } from "@/lib/browser-link";

/** Single structured composer token — used in lists and CodeMirror widgets. */
export function ComposerTokenChip({ part }: { part: Exclude<ComposerPart, { type: "text" }> }) {
  if (part.type === "mention" && part.mentionType === "file") {
    return (
      <InlineTokenChip
        variant="file"
        prefix="@"
        label={part.label}
        asToken
      />
    );
  }

  if (part.type === "mention" && part.mentionType === "profile") {
    return (
      <InlineTokenChip
        variant="profile"
        prefix="@"
        label={part.label}
        asToken
      />
    );
  }

  if (part.type === "link") {
    return (
      <InlineTokenChip
        variant="link"
        label={part.label}
        title={part.url}
        asToken
        onClick={() => openUrlInBrowser(part.url)}
      />
    );
  }

  if (part.type === "command") {
    return (
      <InlineTokenChip
        variant={part.action ? "command-action" : "command"}
        prefix="/"
        label={part.label}
        asToken
      />
    );
  }

  if (part.type === "terminal-snippet") {
    return (
      <InlineTokenChip
        variant="terminal"
        icon={<TerminalIcon className="size-3 shrink-0" />}
        label={part.label}
        title={part.command ? `${part.command}\n\n${part.output.slice(0, 200)}` : part.output.slice(0, 200)}
        asToken
      />
    );
  }

  return null;
}

/** Render structured composer / saved user message tokens. */
export function InlineTokenParts({ parts }: { parts: ComposerPart[] }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={`t-${i}`}>{part.text}</span>;
        }
        return <ComposerTokenChip key={part.id} part={part} />;
      })}
    </span>
  );
}
