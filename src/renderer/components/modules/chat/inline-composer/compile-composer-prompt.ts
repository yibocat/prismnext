import type { ComposerPart } from "@/lib/chat/composer-parts";
import { expandLinkTokensInParts } from "@/lib/chat/composer-parts";
import { partsToPlainText, partsToAgentText } from "@/lib/chat/composer-parts";
import type { ContentBlock } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { isExternalFileId, resolveExternalPath } from "@/lib/files/external-file";
import { mentionFileLabel } from "@/lib/files/mentionable-files";

export interface ActionCommandRef {
  commandName: string;
  action: string;
  source: string;
}

export interface CompiledComposerPrompt {
  displayBlocks: ContentBlock[];
  promptText: string;
  selectedProfileId: string | null;
  actionCommands: ActionCommandRef[];
  aiCommandNames: string[];
}

export async function compileComposerPrompt(
  parts: ComposerPart[],
  expandCommand: (name: string, raw: string) => Promise<string>,
  extraPinnedFiles?: Array<{ filePath: string; selectedText: string }>,
): Promise<CompiledComposerPrompt> {
  parts = expandLinkTokensInParts(parts);
  const actionCommands: ActionCommandRef[] = [];
  const aiCommandNames: string[] = [];
  let selectedProfileId: string | null = null;

  for (const part of parts) {
    if (part.type === "mention" && part.mentionType === "profile") {
      selectedProfileId = part.profileId;
    }
    if (part.type === "command") {
      if (part.action) {
        actionCommands.push({
          commandName: part.commandName,
          action: part.action,
          source: part.source,
        });
      } else {
        aiCommandNames.push(part.commandName);
      }
    }
  }

  const displayLabel = partsToPlainText(parts).trim();
  const displayBlocks: ContentBlock[] = displayLabel || parts.some((p) => p.type !== "text")
    ? [{ type: "text", text: displayLabel, inlineParts: parts }]
    : [];

  const sections: string[] = [];
  const userLine = partsToAgentText(parts).trim();

  const fileParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "mention"; mentionType: "file" }> =>
      p.type === "mention" && p.mentionType === "file",
  );

  const fileBlocks: string[] = [];
  for (const fp of fileParts) {
    let content = useDocumentStore.getState().getContent(fp.fileId);
    if (!content && isExternalFileId(fp.fileId)) {
      const abs = resolveExternalPath(fp.fileId);
      if (abs) {
        try {
          const { content: disk } = await window.electronAPI.fsRead(abs);
          content = disk;
        } catch {
          content = "";
        }
      }
    }
    const displayPath = mentionFileLabel({
      id: fp.fileId,
      name: fp.label,
      relativePath: fp.filePath,
      absolutePath: fp.filePath,
      type: "other",
    });
    const body = content || `[file: ${displayPath}]`;
    fileBlocks.push(`\`\`\`${displayPath}\n${body}\n\`\`\``);
  }

  for (const pinned of extraPinnedFiles ?? []) {
    fileBlocks.push(`\`\`\`${pinned.filePath}\n${pinned.selectedText}\n\`\`\``);
  }

  if (fileBlocks.length > 0) {
    sections.push(["## Referenced files", "", ...fileBlocks].join("\n"));
  }

  const terminalParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "terminal-snippet" }> =>
      p.type === "terminal-snippet",
  );
  if (terminalParts.length > 0) {
    const blocks: string[] = [];
    for (const tp of terminalParts) {
      const header = [
        tp.command ? `$ ${tp.command}` : null,
        tp.cwd ? `cwd: ${tp.cwd}` : null,
        tp.exitCode !== undefined ? `exit: ${tp.exitCode}` : null,
      ].filter(Boolean).join(" · ");
      const body = tp.output.trim() || "(no output)";
      blocks.push(`\`\`\`terminal\n${header ? `${header}\n\n` : ""}${body}\n\`\`\``);
    }
    sections.push(["## Terminal context", "", ...blocks].join("\n"));
  }

  const aiExpansions: string[] = [];
  for (const name of aiCommandNames) {
    try {
      const expanded = await expandCommand(name, `/${name}`);
      aiExpansions.push(expanded);
    } catch {
      aiExpansions.push(`/${name}`);
    }
  }

  if (aiExpansions.length > 0) {
    sections.push(["## Command instructions", "", ...aiExpansions].join("\n\n"));
  }

  if (userLine) {
    sections.push(userLine);
  }

  const promptText = sections.filter(Boolean).join("\n\n");

  return {
    displayBlocks,
    promptText,
    selectedProfileId,
    actionCommands,
    aiCommandNames,
  };
}

/** Whether the compiled prompt should be sent to the model (vs action-only). */
export function shouldSendPromptToAgent(
  compiled: Pick<CompiledComposerPrompt, "promptText" | "aiCommandNames" | "actionCommands">,
  parts: ComposerPart[],
  extraPinnedCount: number,
): boolean {
  if (!compiled.promptText) return false;

  const hasSubstantiveInput =
    compiled.aiCommandNames.length > 0 ||
    extraPinnedCount > 0 ||
    parts.some((p) => p.type === "mention") ||
    parts.some((p) => p.type === "link") ||
    parts.some((p) => p.type === "terminal-snippet") ||
    parts.some((p) => p.type === "text" && p.text.trim().length > 0);

  if (hasSubstantiveInput) return true;

  const onlyActionCommands =
    parts.length > 0 &&
    parts.every(
      (p) =>
        (p.type === "text" && !p.text.trim()) ||
        (p.type === "command" && !!p.action),
    ) &&
    compiled.actionCommands.length > 0;

  return !onlyActionCommands;
}
