/** Default AI Chat composer hint — @ mentions and / slash tokens. */
export const COMPOSER_PLACEHOLDER =
  "@ expert, file, or paper · / commands, skills, MCP";

import {
  isBrowsableUrl,
  linkLabelForUrl,
  looksLikeUrl,
  normalizeBrowserUrl,
} from "@/lib/browser-link/normalize";
import type { GitDiffHunk } from "@/lib/git/diff-hunk-snippet";

export type ComposerPart =
  | { type: "text"; text: string }
  | {
      type: "mention";
      mentionType: "file";
      id: string;
      label: string;
      filePath: string;
      fileId: string;
    }
  | {
      type: "mention";
      mentionType: "expert";
      id: string;
      label: string;
      expertId: string;
    }
  | {
      type: "command";
      id: string;
      label: string;
      commandName: string;
      action?: string;
      source: string;
    }
  | {
      type: "skill";
      id: string;
      label: string;
      skillId: string;
    }
  | {
      type: "mcp";
      id: string;
      label: string;
      serverName: string;
    }
  | {
      type: "link";
      id: string;
      url: string;
      label: string;
    }
  | {
      type: "terminal-snippet";
      id: string;
      label: string;
      command?: string;
      output: string;
      exitCode?: number;
      cwd?: string;
      sourceTabId?: string;
    }
  | {
      type: "code-snippet";
      id: string;
      label: string;
      filePath: string;
      fileId?: string;
      text: string;
      startLine: number;
      endLine: number;
      startCol?: number;
      endCol?: number;
      source: "editor" | "git-diff";
      sourceTabId?: string;
    }
  | {
      type: "git-diff-snippet";
      id: string;
      label: string;
      title: string;
      filePath: string;
      layout: "unified" | "split";
      hunks: GitDiffHunk[];
      removedLineCount: number;
      addedLineCount: number;
      sourceTabId?: string;
    }
  | {
      type: "paper-snippet";
      id: string;
      label: string;
      bibkey: string;
      title: string;
      page: number;
      quotedText: string;
      annotationId?: string;
      sourceTabId?: string;
      blockId?: string;
      blockType?: import("../../../shared/paper-extract-block").ExtractBlockType;
      extractSource?: "mineru";
    }
  | {
      type: "mention";
      mentionType: "paper";
      id: string;
      label: string;
      bibkey: string;
      paperId: string;
    };

export type ComposerDraft = {
  parts: ComposerPart[];
};

/** Match http(s) URLs and bare domains in plain text. */
const URL_IN_TEXT_RE =
  /(?:https?:\/\/[^\s<>"')\]]+|file:\/\/[^\s<>"')\]]+|(?:www\.)?[a-z0-9][-a-z0-9]*(?:\.[-a-z0-9]+)+(?:[/?#][^\s<>"')\]]*)?)/gi;

export function isComposerEmpty(parts: ComposerPart[]): boolean {
  return parts.length === 0 || parts.every((p) => p.type === "text" && !p.text.trim());
}

export function createTokenId(): string {
  return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function plainLabelForPart(part: ComposerPart): string {
  if (part.type === "text") return part.text;
  if (part.type === "mention") return `@${part.label}`;
  if (part.type === "link") return part.label;
  if (part.type === "terminal-snippet") return `[${part.label}]`;
  if (part.type === "code-snippet") return `[${part.label}]`;
  if (part.type === "git-diff-snippet") return `[${part.label}]`;
  if (part.type === "paper-snippet") return `[${part.label}]`;
  if (part.type === "skill" || part.type === "mcp") return `/${part.label}`;
  return `/${part.label}`;
}

/** Join parts; insert a space between a token and following text when needed. */
function joinComposerParts(
  parts: ComposerPart[],
  render: (part: ComposerPart) => string,
): string {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const chunk = render(part);
    if (part.type === "text" && out && !out.endsWith(" ") && !chunk.startsWith(" ")) {
      const prev = parts[i - 1];
      if (prev && prev.type !== "text") out += " ";
    }
    out += chunk;
  }
  return out;
}

/** Flatten parts to human-readable plain text (for copy / session title). */
export function partsToPlainText(parts: ComposerPart[]): string {
  return joinComposerParts(parts, plainLabelForPart);
}

/** Flatten parts for the agent prompt (links use full URL). */
export function partsToAgentText(parts: ComposerPart[]): string {
  return joinComposerParts(parts, (part) => {
    if (part.type === "text") return part.text;
    if (part.type === "link") return part.url;
    if (part.type === "terminal-snippet") return `[terminal: ${part.label}]`;
    if (part.type === "code-snippet") return `[code: ${part.label}]`;
    if (part.type === "git-diff-snippet") return `[diff: ${part.label}]`;
    if (part.type === "paper-snippet") return `[paper: ${part.label}]`;
    if (part.type === "skill") return `[skill: ${part.label}]`;
    if (part.type === "mcp") return `[mcp: ${part.label}]`;
    return plainLabelForPart(part);
  });
}

export function mergeAdjacentText(parts: ComposerPart[]): ComposerPart[] {
  const merged: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text" && merged.length > 0) {
      const prev = merged[merged.length - 1];
      if (prev.type === "text") {
        prev.text += part.text;
        continue;
      }
    }
    if (part.type === "text" && !part.text) continue;
    merged.push(part.type === "text" ? { ...part } : { ...part });
  }
  return merged;
}

export function hasLinkParts(parts: ComposerPart[]): boolean {
  return parts.some((p) => p.type === "link");
}

/** Extract URLs from plain text as composer link tokens. */
export function parseTextWithLinks(text: string): ComposerPart[] {
  if (!text) return [];

  const parts: ComposerPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_IN_TEXT_RE.lastIndex = 0;
  while ((match = URL_IN_TEXT_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    if (start > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, start) });
    }

    const trailing = raw.match(/[.,;:!?)]+$/);
    const core = trailing ? raw.slice(0, -trailing[0].length) : raw;
    const suffix = trailing?.[0] ?? "";

    if (looksLikeUrl(core)) {
      const normalized = normalizeBrowserUrl(core);
      if (isBrowsableUrl(normalized)) {
        parts.push({
          type: "link",
          id: createTokenId(),
          url: normalized,
          label: linkLabelForUrl(normalized),
        });
        if (suffix) parts.push({ type: "text", text: suffix });
        lastIndex = start + raw.length;
        continue;
      }
    }

    parts.push({ type: "text", text: raw });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text }];
}

/** Parse plain text into composer parts (URLs become link tokens). */
export function parseTextToComposerParts(text: string): ComposerPart[] {
  if (!text) return [{ type: "text", text: "" }];
  return mergeAdjacentText(parseTextWithLinks(text));
}

/** Expand URLs inside text parts into link tokens. */
export function expandLinkTokensInParts(parts: ComposerPart[]): ComposerPart[] {
  const out: ComposerPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      out.push(...parseTextToComposerParts(part.text));
    } else {
      out.push(part);
    }
  }
  return mergeAdjacentText(out);
}

/** Whether a single insertion should trigger URL linkification in the composer. */
export function insertedTextTriggersLinkify(inserted: string): boolean {
  if (!inserted) return false;
  return /[\s.,;:!?)\]\n]/.test(inserted);
}
