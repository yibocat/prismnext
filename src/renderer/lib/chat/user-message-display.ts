import type { ContentBlock } from "@/stores/chat-store";
import type { ComposerPart } from "@/lib/chat/composer-parts";
import { createTokenId } from "@/lib/chat/composer-parts";
import type { ConversationAttachment } from "@shared/agent/conversation";

/** Agent-only `##` sections injected into the model prompt — never show in the bubble. */
const DROP_SECTION_HEADERS = new Set([
  "## Referenced files",
  "## Terminal context",
  "## Code context",
  "## Git diff",
  "## Literature context",
  "## Experiment context",
  "## Command instructions",
  "## Notes linked to literature",
  "## Skills to use",
  "## MCP tools",
  "## Composer attachments",
  "## Attachment status (this turn)",
  "## Attached files",
  "## Attachment notes",
  "## Attached images (via vision fallback)",
]);

/** User line can leak into these sections (no following `##`). Recover a trailing paragraph. */
const RECOVER_TRAILING_USER = new Set([
  "## Referenced files",
  "## Command instructions",
]);

const COMPOSER_ATTACH_BOILERPLATE = [
  /^The user attached:/,
  /^If this message does not include converted Markdown/,
  /^Say that plainly\./,
];

type MdSection = { header: string | null; body: string };

function splitMarkdownH2Sections(text: string): MdSection[] {
  const lines = text.split("\n");
  const sections: MdSection[] = [];
  let header: string | null = null;
  let bodyLines: string[] = [];
  const flush = () => {
    sections.push({ header, body: bodyLines.join("\n") });
    bodyLines = [];
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      header = line.trim();
      continue;
    }
    bodyLines.push(line);
  }
  flush();
  return sections;
}

function looksLikeUserParagraph(text: string): boolean {
  const last = text.trim();
  if (!last) return false;
  if (last.startsWith("```") || last.includes("\n```")) return false;
  if (last.startsWith("- ") || last.startsWith("* ")) return false;
  if (last.startsWith("[")) return false;
  if (/^(The file |File not found|Could not |Absolute path:)/.test(last)) return false;
  return true;
}

/** Last paragraph after a blank line — used when the user line sat inside an agent section. */
function recoverTrailingUserParagraph(body: string): string {
  const parts = body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1]!;
  return looksLikeUserParagraph(last) ? last : "";
}

function peelComposerAttachmentBoilerplate(body: string): string {
  const parts = body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let i = 0;
  while (i < parts.length && COMPOSER_ATTACH_BOILERPLATE.some((re) => re.test(parts[i]!))) {
    i += 1;
  }
  return parts.slice(i).join("\n\n").trim();
}

/**
 * Strip agent-only compiled sections from a persisted user prompt, keeping the
 * user's actual message line(s). Used when display snapshots are missing.
 */
export function stripCompiledPromptSections(text: string): string {
  if (!text) return text;
  if (![...DROP_SECTION_HEADERS].some((h) => text.includes(h))) return text;

  const kept: string[] = [];
  for (const section of splitMarkdownH2Sections(text)) {
    if (!section.header) {
      if (section.body.trim()) kept.push(section.body.trim());
      continue;
    }
    if (!DROP_SECTION_HEADERS.has(section.header)) {
      kept.push(`${section.header}\n${section.body}`.trim());
      continue;
    }
    if (section.header === "## Composer attachments") {
      const rest = peelComposerAttachmentBoilerplate(section.body);
      if (rest) kept.push(rest);
      continue;
    }
    if (RECOVER_TRAILING_USER.has(section.header)) {
      const recovered = recoverTrailingUserParagraph(section.body);
      if (recovered) kept.push(recovered);
    }
  }
  return kept.join("\n\n").trim();
}

/** `The user attached: \`a.docx\`, \`b.pptx\`.` from the model prompt. */
export function parseComposerAttachedFileNames(text: string): string[] {
  const m = text.match(/The user attached:\s*((?:`[^`]+`(?:,\s*)?)+)/);
  if (!m?.[1]) return [];
  const names: string[] = [];
  const re = /`([^`]+)`/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(m[1])) !== null) {
    const name = hit[1].trim();
    if (name) names.push(name);
  }
  return names;
}

function fileMentionPart(name: string, path: string): ComposerPart {
  return {
    type: "mention",
    mentionType: "file",
    id: createTokenId(),
    label: name || path.split(/[/\\]/).pop() || "file",
    filePath: path,
    fileId: "",
  };
}

function promoteFileAttachmentsToChips(
  stripped: string,
  attachments: ConversationAttachment[] | undefined,
  namesFromPrompt: string[],
): { text: string; inlineParts?: ComposerPart[]; attachments?: ConversationAttachment[] } {
  const images = (attachments ?? []).filter((a) => a.kind === "image");
  const files = (attachments ?? []).filter((a) => a.kind !== "image");
  const seen = new Set(files.map((f) => (f.name || f.path).trim()).filter(Boolean));
  const extraNames = namesFromPrompt.filter((n) => n && !seen.has(n));
  if (files.length === 0 && extraNames.length === 0) {
    return {
      text: stripped,
      attachments: images.length > 0 ? images : undefined,
    };
  }

  const parts: ComposerPart[] = [];
  if (stripped) parts.push({ type: "text", text: stripped });
  for (const file of files) {
    parts.push(fileMentionPart(file.name, file.path));
  }
  for (const name of extraNames) {
    parts.push(fileMentionPart(name, name));
  }
  return {
    text: stripped,
    inlineParts: parts,
    attachments: images.length > 0 ? images : undefined,
  };
}

/** True when text is OpenCode patch metadata leaked as a text part. */
export function isPatchMetadataText(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return false;
  try {
    const parsed = JSON.parse(t) as { type?: string; hash?: string; files?: unknown };
    return parsed.type === "patch" && typeof parsed.hash === "string";
  } catch {
    return false;
  }
}

/** Hide compiled prompt noise and internal metadata from user message blocks. */
export function sanitizeUserContentBlocksForDisplay(
  blocks: ContentBlock[],
): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "text" || !block.text) {
      out.push(block);
      continue;
    }
    if (block.inlineParts?.length) {
      out.push(block);
      continue;
    }
    if (isPatchMetadataText(block.text)) continue;
    const namesFromPrompt = parseComposerAttachedFileNames(block.text);
    const stripped = stripCompiledPromptSections(block.text);
    const promoted = promoteFileAttachmentsToChips(
      stripped,
      block.attachments,
      namesFromPrompt,
    );
    if (!promoted.text && !promoted.inlineParts?.length && !promoted.attachments?.length) {
      continue;
    }
    out.push({
      ...block,
      text: promoted.text,
      ...(promoted.inlineParts ? { inlineParts: promoted.inlineParts } : {}),
      attachments: promoted.attachments,
    });
  }
  return out;
}
