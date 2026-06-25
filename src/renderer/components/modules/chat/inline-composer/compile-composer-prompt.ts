import type { ComposerPart } from "@/lib/chat/composer-parts";
import { expandLinkTokensInParts } from "@/lib/chat/composer-parts";
import { partsToPlainText, partsToAgentText } from "@/lib/chat/composer-parts";
import type { ContentBlock } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { isExternalFileId, resolveExternalPath } from "@/lib/files/external-file";
import { mentionFileLabel } from "@/lib/files/mentionable-files";
import { resolveSnippetFilePathFromStore } from "@/lib/files/snippet-file-path";
import { formatUnifiedPatch } from "@/lib/git/diff-hunk-snippet";

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
  /** MCP servers explicitly requested via composer `/` tokens. */
  mcpServerNames: string[];
  /** Skill ids explicitly requested via composer `/` tokens. */
  skillIds: string[];
}

export async function compileComposerPrompt(
  parts: ComposerPart[],
  expandCommand: (name: string, raw: string) => Promise<string>,
  extraPinnedFiles?: Array<{ filePath: string; selectedText: string }>,
): Promise<CompiledComposerPrompt> {
  parts = expandLinkTokensInParts(parts);
  const actionCommands: ActionCommandRef[] = [];
  const aiCommandNames: string[] = [];
  const mcpServerNames: string[] = [];
  const skillIds: string[] = [];
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
    if (part.type === "skill") {
      skillIds.push(part.skillId);
    }
    if (part.type === "mcp") {
      mcpServerNames.push(part.serverName);
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

  const codeParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "code-snippet" }> => p.type === "code-snippet",
  );
  if (codeParts.length > 0) {
    const blocks: string[] = [];
    for (const cp of codeParts) {
      const displayPath = resolveSnippetFilePathFromStore(cp.fileId, cp.filePath);
      const loc =
        cp.startLine === cp.endLine
          ? `lines ${cp.startLine}`
          : `lines ${cp.startLine}-${cp.endLine}`;
      const sourceLabel = cp.source === "git-diff" ? "git diff" : "editor";
      const body = cp.text.trim() || "(empty selection)";
      blocks.push(`\`\`\`${displayPath}\n# ${sourceLabel}, ${loc}\n${body}\n\`\`\``);
    }
    sections.push(["## Code context", "", ...blocks].join("\n"));
  }

  const gitDiffParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "git-diff-snippet" }> =>
      p.type === "git-diff-snippet",
  );
  if (gitDiffParts.length > 0) {
    const blocks: string[] = [];
    for (const dp of gitDiffParts) {
      const displayPath = resolveSnippetFilePathFromStore(undefined, dp.filePath);
      const body = formatUnifiedPatch(displayPath, dp.hunks);
      blocks.push(`\`\`\`diff\n${body}\n\`\`\``);
    }
    sections.push(["## Git diff", "", ...blocks].join("\n"));
  }

  const aiExpansions: string[] = [];
  for (const name of aiCommandNames) {
    try {
      const expanded = await expandCommand(name, `/${name}`);
      if (expanded.trim()) aiExpansions.push(expanded);
    } catch {
      aiExpansions.push(`/${name}`);
    }
  }

  if (aiExpansions.length > 0) {
    sections.push(["## Command instructions", "", ...aiExpansions].join("\n\n"));
  }

  const skillParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "skill" }> => p.type === "skill",
  );
  if (skillParts.length > 0) {
    const lines = skillParts.map(
      (p) =>
        `- Invoke the **Skill** tool for \`${p.label}\`${p.skillId !== p.label ? ` (id: ${p.skillId})` : ""}`,
    );
    sections.push(["## Skills to use", "", ...lines].join("\n"));
  }

  const mcpParts = parts.filter((p): p is Extract<ComposerPart, { type: "mcp" }> => p.type === "mcp");
  if (mcpParts.length > 0) {
    const names = [...new Set(mcpParts.map((p) => p.serverName))];
    sections.push(
      [
        "## MCP tools",
        "",
        `Enable and use tools from MCP server(s): ${names.join(", ")}.`,
        "Call the relevant MCP tools to complete the request below.",
      ].join("\n"),
    );
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
    mcpServerNames: [...new Set(mcpServerNames)],
    skillIds: [...new Set(skillIds)],
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
    parts.some((p) => p.type === "code-snippet") ||
    parts.some((p) => p.type === "git-diff-snippet") ||
    parts.some((p) => p.type === "skill") ||
    parts.some((p) => p.type === "mcp") ||
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
