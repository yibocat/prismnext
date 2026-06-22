import type { ComposerPart } from "./tokens";
import type { ContentBlock } from "@/stores/chat-store";
import { partsToPlainText } from "./tokens";
import { useDocumentStore } from "@/stores/document-store";

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
  const userLine = displayLabel;

  const fileParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "mention"; mentionType: "file" }> =>
      p.type === "mention" && p.mentionType === "file",
  );

  const fileBlocks: string[] = [];
  for (const fp of fileParts) {
    const content = useDocumentStore.getState().getContent(fp.fileId);
    const body = content || `[file: ${fp.filePath}]`;
    fileBlocks.push(`\`\`\`${fp.filePath}\n${body}\n\`\`\``);
  }

  for (const pinned of extraPinnedFiles ?? []) {
    fileBlocks.push(`\`\`\`${pinned.filePath}\n${pinned.selectedText}\n\`\`\``);
  }

  if (fileBlocks.length > 0) {
    sections.push(["## Referenced files", "", ...fileBlocks].join("\n"));
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
