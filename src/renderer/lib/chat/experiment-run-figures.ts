/**
 * Experiment figures in assistant chat replies.
 *
 * Prefer the model embedding `![…](project-relative-path)` in its own prose.
 * As a hard fallback, the UI appends a short natural reply block when those
 * images are missing from the assistant text (message stream, not tool dropdown).
 */
import type { ContentBlock } from "@/stores/chat-store";
import { resolveImageArtifactPaths } from "@/modes/experiments-mode/experiments-artifact-nav";

function parseToolJson(content: unknown): Record<string, unknown> | null {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (typeof parsed === "string") {
      try {
        const inner = JSON.parse(parsed) as unknown;
        if (typeof inner === "object" && inner !== null && !Array.isArray(inner)) {
          return inner as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function unwrapPayload(content: unknown): Record<string, unknown> | null {
  const outer = parseToolJson(content);
  if (!outer) return null;
  if (typeof outer.output === "string") {
    return parseToolJson(outer.output) ?? outer;
  }
  return outer;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/** Whether this tool_use is an experiment run that may carry image artifacts. */
export function isExperimentFigureToolUse(toolUse: ContentBlock): boolean {
  const name = (toolUse.name || "").toLowerCase();
  if (name === "experiment-run") return true;
  if (name !== "experiment-log") return false;
  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  return input.action === "append_run";
}

/**
 * Project-relative image paths from a successful experiment-run / append_run result.
 * Empty when missing result, error, or no image artifacts.
 */
export function extractExperimentImageArtifactPaths(
  toolUse: ContentBlock,
  toolResult?: ContentBlock,
): string[] {
  if (!isExperimentFigureToolUse(toolUse)) return [];
  if (!toolResult || toolResult.is_error) return [];

  const data = unwrapPayload(toolResult.content ?? toolUse.content);
  if (!data || data.ok === false) return [];

  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  const run = data.run as Record<string, unknown> | undefined;
  const artifacts = asStringArray(run?.artifacts ?? data.artifacts);
  const inputArtifacts = asStringArray(input.artifacts);
  const merged = artifacts.length ? artifacts : inputArtifacts;

  const cwd =
    (typeof run?.cwd === "string" && run.cwd) ||
    (typeof data.workspacePath === "string" && data.workspacePath) ||
    (typeof input.id === "string" && typeof data.experimentRoot === "string"
      ? `${data.experimentRoot}/${input.id}`
      : undefined);

  return resolveImageArtifactPaths(merged, cwd);
}

/** Collect image artifact paths from all experiment tool_use blocks in a message. */
export function collectExperimentImagePathsFromBlocks(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const result = toolResultMap.get(block.id || "");
    for (const p of extractExperimentImageArtifactPaths(block, result)) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

/** True when assistant markdown already embeds this project-relative image. */
export function assistantTextEmbedsImagePath(text: string, projectRelPath: string): boolean {
  if (!text || !projectRelPath) return false;
  const norm = projectRelPath.replace(/\\/g, "/");
  const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // ![…](path) or bare path mentioned as markdown image target
  const re = new RegExp(`!\\[[^\\]]*\\]\\(\\s*${escaped}\\s*\\)`, "i");
  return re.test(text);
}

export function missingExperimentImagePathsInText(
  textCorpus: string,
  paths: string[],
): string[] {
  return paths.filter((p) => !assistantTextEmbedsImagePath(textCorpus, p));
}

/**
 * Natural reply prose + markdown images for paths not already in the assistant text.
 * Rendered as a normal chat text block (same MarkdownRenderer as AI prose).
 */
export function buildNaturalFigureReplyMarkdown(paths: string[]): string {
  if (!paths.length) return "";
  const fileName = (p: string) => p.replace(/\\/g, "/").split("/").pop() || p;
  if (paths.length === 1) {
    const p = paths[0]!;
    return `本次运行生成的图如下：\n\n![${fileName(p)}](${p})`;
  }
  const lines = ["本次运行生成的图如下：", ""];
  for (const p of paths) {
    lines.push(`![${fileName(p)}](${p})`, "");
  }
  return lines.join("\n").trim();
}

/** Paths still missing from assistant text blocks (for reply-body fallback). */
export function resolveMissingFigurePathsForReply(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string[] {
  const all = collectExperimentImagePathsFromBlocks(blocks, toolResultMap);
  if (!all.length) return [];
  const corpus = blocks
    .filter((b): b is ContentBlock & { type: "text"; text: string } =>
      b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text)
    .join("\n");
  return missingExperimentImagePathsInText(corpus, all);
}
