import type { ComposerPart } from "@/lib/chat/composer-parts";
import { expandLinkTokensInParts } from "@/lib/chat/composer-parts";
import { partsToPlainText, partsToAgentText } from "@/lib/chat/composer-parts";
import type { ContentBlock } from "@/stores/chat-store";
import type { ComposerAttachment, PromptImageAttachment, PromptFileAttachment } from "@/lib/chat/composer-attach-file";
import {
  isVisionImagePath,
  promptImageFromAttachment,
  promptFileFromAttachment,
} from "@/lib/chat/composer-attach-file";
import { useDocumentStore } from "@/stores/document-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { isExternalFileId, resolveExternalPath } from "@/lib/files/external-file";
import { mentionFileLabel } from "@/lib/files/mentionable-files";
import { resolveSnippetFilePathFromStore } from "@/lib/files/snippet-file-path";
import { formatUnifiedPatch } from "@/lib/git/diff-hunk-snippet";
import { useLiteratureStore } from "@/stores/literature-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import {
  listPaperNotes,
  resolvePaperForNote,
} from "@/lib/literature/paper-notes";
import {
  buildPaperAgentContextBlock,
  PAPER_AGENT_CONTEXT_FOOTER,
  type PaperNoteAgentContext,
} from "@/lib/literature/paper-agent-context";
import { rewritePaperExtractImageSrcs } from "@shared/paper-extract-images";

/** Max chars inlined per @-mentioned text file (rest truncated with a note). */
const MAX_INLINE_ATTACHMENT_CHARS = 200_000;

function looksLikeBinaryText(content: string): boolean {
  if (!content) return false;
  const sample = content.slice(0, 8_000);
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true;
    if (code < 8 || (code >= 14 && code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      weird += 1;
    }
  }
  return weird / sample.length > 0.05;
}

function formatInlinedFileBlock(displayPath: string, content: string, absolutePath?: string): string {
  if (!content) {
    return [
      `[file unavailable: ${displayPath}]`,
      absolutePath ? `Absolute path: \`${absolutePath}\`` : null,
      "Could not read text content. Use file tools if the path is accessible.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (looksLikeBinaryText(content)) {
    return [
      `[binary-looking file: ${displayPath}]`,
      absolutePath ? `Absolute path: \`${absolutePath}\`` : null,
      "Content was not inlined. Use file tools to inspect this path.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (content.length > MAX_INLINE_ATTACHMENT_CHARS) {
    const truncated = content.slice(0, MAX_INLINE_ATTACHMENT_CHARS);
    return [
      `\`\`\`${displayPath}`,
      truncated,
      "",
      `… [truncated: showing ${MAX_INLINE_ATTACHMENT_CHARS} of ${content.length} chars]`,
      absolutePath ? `Full path: \`${absolutePath}\`` : null,
      "```",
    ]
      .filter((line) => line !== null)
      .join("\n");
  }
  return `\`\`\`${displayPath}\n${content}\n\`\`\``;
}

async function resolveProjectFileContent(
  fileId: string | undefined,
  relativePath: string,
): Promise<string> {
  if (fileId) {
    const fromStore = useDocumentStore.getState().getAsset(fileId);
    if (fromStore) return fromStore;
  }
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return "";
  try {
    const abs = `${projectRoot}/${relativePath.replace(/^\//, "")}`;
    const { content } = await window.electronAPI.fsRead(abs);
    return content;
  } catch {
    return "";
  }
}

async function buildNotebookContentMap(
  files: ReturnType<typeof useDocumentStore.getState>["files"],
  notebookDir: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const prefix = `${notebookDir}/`;
  for (const f of files) {
    if (!f.relativePath.startsWith(prefix) || !f.relativePath.endsWith(".md")) continue;
    const content = await resolveProjectFileContent(f.id, f.relativePath);
    if (content) map.set(f.relativePath, content);
  }
  return map;
}

export interface ActionCommandRef {
  commandName: string;
  action: string;
  source: string;
}

export interface CompiledComposerPrompt {
  displayBlocks: ContentBlock[];
  promptText: string;
  /** All @expert chip ids in order. */
  selectedExpertIds: string[];
  actionCommands: ActionCommandRef[];
  aiCommandNames: string[];
  /** MCP servers explicitly requested via composer `/` tokens. */
  mcpServerNames: string[];
  /** Skill ids explicitly requested via composer `/` tokens. */
  skillIds: string[];
  /** PDF paper excerpt chips attached this turn (block pick → Chat). */
  paperSnippetCount: number;
  /** Experiment ids @-mentioned this turn (for tools/UI cross-ref). */
  selectedExperimentIds: string[];
  /** Vision images sent as ACP `ContentBlock::Image` (not inlined as text). */
  promptImages: PromptImageAttachment[];
  /**
   * Composer strip file attachments as ACP `resource_link` (not dumped into prompt text).
   * @see https://agentclientprotocol.com/protocol/v1/content
   */
  promptFiles: PromptFileAttachment[];
}

export async function compileComposerPrompt(
  parts: ComposerPart[],
  expandCommand: (name: string, raw: string) => Promise<string>,
  extraPinnedFiles?: Array<{ filePath: string; selectedText: string }>,
  attachments?: ComposerAttachment[],
): Promise<CompiledComposerPrompt> {
  parts = expandLinkTokensInParts(parts);
  const actionCommands: ActionCommandRef[] = [];
  const aiCommandNames: string[] = [];
  const mcpServerNames: string[] = [];
  const skillIds: string[] = [];
  const selectedExpertIds: string[] = [];
  const selectedExperimentIds: string[] = [];

  for (const part of parts) {
    if (part.type === "mention" && part.mentionType === "expert") {
      if (!selectedExpertIds.includes(part.expertId)) {
        selectedExpertIds.push(part.expertId);
      }
    }
    if (part.type === "mention" && part.mentionType === "experiment") {
      if (!selectedExperimentIds.includes(part.experimentId)) {
        selectedExperimentIds.push(part.experimentId);
      }
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
  const attachmentDisplay = (attachments ?? []).map((a) => ({
    name: a.name,
    kind: a.kind,
    path: a.displayPath,
    previewUrl: a.previewUrl,
    note: a.note,
  }));
  const displayBlocks: ContentBlock[] =
    displayLabel || parts.some((p) => p.type !== "text") || attachmentDisplay.length > 0
      ? [
          {
            type: "text",
            text: displayLabel,
            inlineParts: parts.some((p) => p.type !== "text") || displayLabel ? parts : undefined,
            attachments: attachmentDisplay.length > 0 ? attachmentDisplay : undefined,
          },
        ]
      : [];

  const sections: string[] = [];
  const userLine = partsToAgentText(parts).trim();

  const fileParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "mention"; mentionType: "file" }> =>
      p.type === "mention" && p.mentionType === "file",
  );

  const fileBlocks: string[] = [];
  const promptImages: PromptImageAttachment[] = [];
  const promptFiles: PromptFileAttachment[] = [];
  for (const fp of fileParts) {
    let content = useDocumentStore.getState().getAsset(fp.fileId);
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
    fileBlocks.push(formatInlinedFileBlock(displayPath, content, fp.filePath));
  }

  for (const att of attachments ?? []) {
    if (att.kind === "image" || isVisionImagePath(att.absolutePath)) {
      const img = await promptImageFromAttachment(att);
      if (img) promptImages.push(img);
      continue;
    }
    // File strip attachments → ACP resource_link (file upload), not prompt text dump.
    promptFiles.push(promptFileFromAttachment(att));
  }

  for (const pinned of extraPinnedFiles ?? []) {
    fileBlocks.push(`\`\`\`${pinned.filePath}\n${pinned.selectedText}\n\`\`\``);
  }

  if (fileBlocks.length > 0) {
    sections.push(["## Referenced files", "", ...fileBlocks].join("\n"));
  }

  const linkedLiteratureFromNotes: string[] = [];
  for (const fp of fileParts) {
    if (!fp.filePath.toLowerCase().endsWith(".md")) continue;
    let content = useDocumentStore.getState().getAsset(fp.fileId);
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
    if (!content) continue;
    const linkedPaper = resolvePaperForNote(content, useLiteratureStore.getState().papers);
    if (linkedPaper) {
      linkedLiteratureFromNotes.push(
        `- \`${fp.filePath}\` → @${linkedPaper.bibkey ?? linkedPaper.id}: **${linkedPaper.title}**`,
      );
    }
  }
  if (linkedLiteratureFromNotes.length > 0) {
    sections.push(
      ["## Notes linked to literature", "", ...linkedLiteratureFromNotes].join("\n"),
    );
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

  const paperParts = parts.filter(
    (p): p is Extract<ComposerPart, { type: "paper-snippet" }> => p.type === "paper-snippet",
  );
  const paperMentions = parts.filter(
    (p): p is Extract<ComposerPart, { type: "mention"; mentionType: "paper" }> =>
      p.type === "mention" && p.mentionType === "paper",
  );
  if (paperParts.length > 0 || paperMentions.length > 0) {
    const blocks: string[] = [];
    const projectRoot = useDocumentStore.getState().projectRoot;
    const workspaceDirs = useWorkspaceConfigStore.getState().workspaceDirs;
    const files = useDocumentStore.getState().files;
    const notebookDir = resolveNotebookDir(workspaceDirs);
    const contentByPath = await buildNotebookContentMap(files, notebookDir);

    for (const pp of paperParts) {
      const blockHint = pp.blockType ? `, block: ${pp.blockType}` : "";
      const paper =
        useLiteratureStore.getState().papers.find((p) => p.bibkey === pp.bibkey) ?? null;
      const excerptRaw = pp.quotedText.trim() || "(empty excerpt)";
      const excerpt = paper ? rewritePaperExtractImageSrcs(excerptRaw, paper.id) : excerptRaw;
      blocks.push(
        `\`\`\`paper ${pp.bibkey}\n# ${pp.title} (p.${pp.page}${blockHint})\n${excerpt}\n\`\`\``,
      );
    }

    for (const pm of paperMentions) {
      let paper =
        useLiteratureStore.getState().papers.find(
          (p) => p.id === pm.paperId || (pm.bibkey && p.bibkey === pm.bibkey),
        ) ?? null;

      if (!paper && projectRoot && pm.paperId) {
        try {
          paper = await window.electronAPI.literatureGet(projectRoot, pm.paperId);
        } catch {
          paper = null;
        }
      }

      if (paper) {
        const noteFiles = listPaperNotes(paper, files, notebookDir, contentByPath);
        const notes: PaperNoteAgentContext[] = [];
        for (const note of noteFiles) {
          const content =
            contentByPath.get(note.relativePath) ??
            (await resolveProjectFileContent(
              files.find((f) => f.relativePath === note.relativePath)?.id,
              note.relativePath,
            ));
          notes.push({ relativePath: note.relativePath, content });
        }
        blocks.push(buildPaperAgentContextBlock(paper, notes));
      } else {
        blocks.push(`### @${pm.bibkey}\n\n- **Cite key:** ${pm.bibkey}\n- (${pm.label})`);
      }
    }

    blocks.push(PAPER_AGENT_CONTEXT_FOOTER);
    sections.push(["## Literature context", "", ...blocks].join("\n"));
  }

  // ## Experiment context: assemble a compact summary per @-mentioned experiment
  // so the agent knows which experiments the user is referring to and can drill
  // in with `experiment-log read` / `provenance-query list_recent` as needed.
  if (selectedExperimentIds.length > 0) {
    const experiments = useExperimentStore.getState().experiments;
    const expBlocks: string[] = [];
    for (const expId of selectedExperimentIds) {
      const exp = experiments.find((e) => e.id === expId);
      if (!exp) {
        expBlocks.push(`### @experiment ${expId}\n\n- (no cached summary — call \`experiment-log read\` for details)`);
        continue;
      }
      const runMeta = exp.runCount > 0
        ? `${exp.runCount} run${exp.runCount === 1 ? "" : "s"}${exp.lastRunAt ? `, last ${exp.lastRunAt}` : ""}`
        : "no runs yet";
      expBlocks.push(
        [
          `### @experiment ${exp.id}`,
          `- **title:** ${exp.title}`,
          `- **workspace:** ${exp.workspacePath}`,
          `- **activity:** ${runMeta}`,
          `- tip: use \`experiment-log action=read id=${exp.id}\` (or \`provenance-query list_recent\`) to inspect runs/artifacts.`,
        ].join("\n"),
      );
    }
    sections.push(["## Experiment context", "", ...expBlocks].join("\n"));
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

  const paperSnippetCount = parts.filter((p) => p.type === "paper-snippet").length;

  return {
    displayBlocks,
    promptText,
    selectedExpertIds,
    selectedExperimentIds,
    actionCommands,
    aiCommandNames,
    mcpServerNames: [...new Set(mcpServerNames)],
    skillIds: [...new Set(skillIds)],
    paperSnippetCount,
    promptImages,
    promptFiles,
  };
}

/** Whether the compiled prompt should be sent to the model (vs action-only). */
export function shouldSendPromptToAgent(
  compiled: Pick<
    CompiledComposerPrompt,
    "promptText" | "aiCommandNames" | "actionCommands" | "promptImages" | "promptFiles"
  >,
  parts: ComposerPart[],
  extraPinnedCount: number,
): boolean {
  if (
    !compiled.promptText &&
    !(compiled.promptImages?.length > 0) &&
    !(compiled.promptFiles?.length > 0)
  ) {
    return false;
  }

  const hasSubstantiveInput =
    compiled.aiCommandNames.length > 0 ||
    (compiled.promptImages?.length ?? 0) > 0 ||
    (compiled.promptFiles?.length ?? 0) > 0 ||
    extraPinnedCount > 0 ||
    Boolean(compiled.promptText?.includes("## Referenced files")) ||
    parts.some((p) => p.type === "mention") ||
    parts.some((p) => p.type === "link") ||
    parts.some((p) => p.type === "terminal-snippet") ||
    parts.some((p) => p.type === "code-snippet") ||
    parts.some((p) => p.type === "git-diff-snippet") ||
    parts.some((p) => p.type === "paper-snippet") ||
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

/** Build the user-visible bubble without reading file bodies (fast path before send). */
export function buildComposerDisplayBlocks(
  parts: ComposerPart[],
  attachments?: ComposerAttachment[],
): ContentBlock[] {
  const expanded = expandLinkTokensInParts(parts);
  const displayLabel = partsToPlainText(expanded).trim();
  const attachmentDisplay = (attachments ?? []).map((a) => ({
    name: a.name,
    kind: a.kind,
    path: a.displayPath,
    previewUrl: a.previewUrl,
    note: a.note,
  }));
  if (!displayLabel && !expanded.some((p) => p.type !== "text") && attachmentDisplay.length === 0) {
    return [];
  }
  return [
    {
      type: "text",
      text: displayLabel,
      inlineParts: expanded.some((p) => p.type !== "text") || displayLabel ? expanded : undefined,
      attachments: attachmentDisplay.length > 0 ? attachmentDisplay : undefined,
    },
  ];
}
