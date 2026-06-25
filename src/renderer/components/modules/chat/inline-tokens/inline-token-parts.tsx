import type { ComposerPart } from "@/lib/chat/composer-parts";
import { GitCompareArrowsIcon } from "lucide-react";
import { InlineTokenChip } from "./inline-token-chip";
import { openUrlInBrowser } from "@/lib/browser-link";

function GitDiffStatsSuffix({
  added,
  removed,
}: {
  added: number;
  removed: number;
}) {
  if (added <= 0 && removed <= 0) return null;
  return (
    <span className="ml-0.5 inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] tabular-nums leading-none">
      {added > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>}
      {removed > 0 && <span className="text-rose-600 dark:text-rose-400">−{removed}</span>}
    </span>
  );
}

/** Single structured composer token — used in lists and CodeMirror widgets. */
export function ComposerTokenChip({
  part,
  openLinks = false,
}: {
  part: Exclude<ComposerPart, { type: "text" }>;
  /** Allow opening link tokens (off in composer editor). */
  openLinks?: boolean;
}) {
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
        asToken={!openLinks}
        onClick={openLinks ? () => openUrlInBrowser(part.url) : undefined}
      />
    );
  }

  if (part.type === "command") {
    return (
      <InlineTokenChip
        variant={part.action ? "command-action" : "command"}
        prefix="/"
        label={part.label}
        title={part.action ? `Action: ${part.action}` : undefined}
        asToken
      />
    );
  }

  if (part.type === "skill") {
    return (
      <InlineTokenChip
        variant="skill"
        prefix="/"
        label={part.label}
        asToken
      />
    );
  }

  if (part.type === "mcp") {
    return (
      <InlineTokenChip
        variant="mcp"
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
        label={part.label}
        title={
          part.command
            ? `${part.command}\n\n${part.output.slice(0, 200)}`
            : part.output.slice(0, 200)
        }
        asToken
      />
    );
  }

  if (part.type === "code-snippet") {
    const fromGitDiff = part.source === "git-diff";
    return (
      <InlineTokenChip
        variant={fromGitDiff ? "code-git" : "code"}
        label={part.label}
        title={`${part.filePath}\n\n${part.text.slice(0, 200)}`}
        asToken
      />
    );
  }

  if (part.type === "git-diff-snippet") {
    return (
      <InlineTokenChip
        variant="git-diff"
        icon={<GitCompareArrowsIcon className="size-3 shrink-0" />}
        label={part.label}
        title={part.title}
        suffix={
          <GitDiffStatsSuffix
            added={part.addedLineCount}
            removed={part.removedLineCount}
          />
        }
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
        return <ComposerTokenChip key={part.id} part={part} openLinks />;
      })}
    </span>
  );
}
