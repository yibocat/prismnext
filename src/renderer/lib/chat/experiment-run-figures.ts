/**
 * Tool result files in assistant chat replies.
 *
 * Prefer the model embedding ```artifact fences (or `![…](path)` for images).
 * Narrow fallback: append fences for missing experiment-run / append_run
 * artifacts and latex-compile PDF output.
 */
import type { ToolOutcome } from "../../../shared/agent-runtime";
import type { ContentBlock } from "@/stores/chat-store";
import {
  artifactBasename,
  isImageArtifactPath,
  normalizeArtifactSlash,
  resolveImageArtifactPathsForDisplay,
} from "../../../shared/artifact-path";
import {
  assistantTextEmbedsArtifactPath,
  buildArtifactFallbackMarkdown,
  CHAT_ARTIFACT_AUTO_CAP,
  collapseVisualArtifactPaths,
  collectEmbeddedArtifactPaths,
  missingArtifactPathsInText,
  presentOutcomeResource,
} from "@/lib/markdown/chat-artifact";

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

/** Whether this tool_use may carry run artifacts for reply fallback. */
export function isExperimentFigureToolUse(toolUse: ContentBlock): boolean {
  const name = (toolUse.name || "").toLowerCase();
  if (name === "experiment-run") return true;
  if (name !== "experiment-log") return false;
  const input = (toolUse.input ?? {}) as Record<string, unknown>;
  return input.action === "append_run";
}

/**
 * Paths to show for a run: keep every artifact; for images prefer a matching
 * snapshot (same basename) when present so chat shows the frozen figure.
 * Same figure in several formats (PDF + PNG + SVG) collapses to one preview.
 */
export function pathsForRunChatDisplay(opts: {
  artifacts: string[];
  artifactSnapshots?: string[];
  workspacePath?: string;
}): string[] {
  const arts = opts.artifacts.map(normalizeArtifactSlash).filter(Boolean);
  const snaps = (opts.artifactSnapshots ?? []).map(normalizeArtifactSlash).filter(Boolean);
  const snapByBase = new Map<string, string>();
  for (const s of snaps) {
    const base = artifactBasename(s);
    if (base) snapByBase.set(base, s);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of arts) {
    let chosen = a;
    if (isImageArtifactPath(a)) {
      const snap = snapByBase.get(artifactBasename(a));
      if (snap) chosen = snap;
      else {
        const resolved = resolveImageArtifactPathsForDisplay([a], opts.workspacePath);
        chosen = resolved[0] ?? a;
      }
    }
    const n = normalizeArtifactSlash(chosen);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return collapseVisualArtifactPaths(out);
}

/**
 * Project-relative paths from a successful experiment-run / append_run result
 * (any file kind). Empty when missing result or error.
 */
export function extractExperimentArtifactPaths(
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
  const snapshots = asStringArray(run?.artifactSnapshots ?? data.artifactSnapshots);
  const inputArtifacts = asStringArray(input.artifacts);
  const mergedArts = artifacts.length ? artifacts : inputArtifacts;
  if (!mergedArts.length) return [];

  const cwd =
    (typeof run?.cwd === "string" && run.cwd) ||
    (typeof data.workspacePath === "string" && data.workspacePath) ||
    (typeof input.id === "string" && typeof data.experimentRoot === "string"
      ? `${data.experimentRoot}/${input.id}`
      : undefined);

  return pathsForRunChatDisplay({
    artifacts: mergedArts,
    artifactSnapshots: snapshots,
    workspacePath: cwd,
  });
}

/** @deprecated Use extractExperimentArtifactPaths — kept for image-only call sites. */
export function extractExperimentImageArtifactPaths(
  toolUse: ContentBlock,
  toolResult?: ContentBlock,
): string[] {
  return extractExperimentArtifactPaths(toolUse, toolResult).filter(isImageArtifactPath);
}

export function isLatexCompileToolUse(toolUse: ContentBlock): boolean {
  const name = (toolUse.name || "").toLowerCase();
  return name === "latex-compile" || name === "latex-compile-standalone";
}

/** Successful compile PDF (in-place figure or `.workbench/compile/` paper). */
export function extractLatexCompileArtifactPaths(
  toolUse: ContentBlock,
  toolResult?: ContentBlock,
): string[] {
  if (!isLatexCompileToolUse(toolUse)) return [];
  if (!toolResult || toolResult.is_error) return [];
  const data = unwrapPayload(toolResult.content ?? toolUse.content);
  if (!data) return [];
  const nested = data.result;
  const inner =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : data;
  if (inner.success !== true && data.success !== true) return [];
  const pdfPath =
    (typeof inner.pdfPath === "string" && inner.pdfPath.trim())
    || (typeof data.pdfPath === "string" && data.pdfPath.trim())
    || "";
  if (!pdfPath) return [];
  return collapseVisualArtifactPaths([normalizeArtifactSlash(pdfPath)]);
}

function filePathsFromOutcome(outcome: ToolOutcome | undefined): string[] {
  if (!outcome?.resources?.length) return [];
  return collapseVisualArtifactPaths(
    outcome.resources
      .filter((resource): resource is Extract<ToolOutcome["resources"][number], { type: "file" }> => (
        resource.type === "file" && presentOutcomeResource(resource) !== "skip"
      ))
      .map((resource) => resource.path),
  );
}

export function collectExperimentArtifactPathsFromBlocks(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const result = toolResultMap.get(block.id || "");
    const fromOutcome = filePathsFromOutcome(result?.outcome);
    const paths = fromOutcome.length
      ? fromOutcome
      : [
          ...extractExperimentArtifactPaths(block, result),
          ...extractLatexCompileArtifactPaths(block, result),
        ];
    for (const p of paths) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  // Repeated runs of one figure surface working path + snapshot — one preview.
  return collapseVisualArtifactPaths(out);
}

/** @deprecated */
export function collectExperimentImagePathsFromBlocks(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string[] {
  return collectExperimentArtifactPathsFromBlocks(blocks, toolResultMap).filter(
    isImageArtifactPath,
  );
}

export function assistantTextEmbedsImagePath(text: string, projectRelPath: string): boolean {
  return assistantTextEmbedsArtifactPath(text, projectRelPath);
}

export function missingExperimentImagePathsInText(
  textCorpus: string,
  paths: string[],
): string[] {
  return missingArtifactPathsInText(textCorpus, paths);
}

/** @deprecated Prefer buildArtifactFallbackMarkdown via resolveMissingArtifactPathsForReply. */
export function buildNaturalFigureReplyMarkdown(paths: string[]): string {
  return buildArtifactFallbackMarkdown(paths);
}

function assistantTextCorpus(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is ContentBlock & { type: "text"; text: string } =>
      b.type === "text" && typeof b.text === "string",
    )
    .map((b) => b.text)
    .join("\n");
}

export function resolveMissingArtifactPathsForReply(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string[] {
  const all = collectExperimentArtifactPathsFromBlocks(blocks, toolResultMap);
  if (!all.length) return [];
  return missingArtifactPathsInText(assistantTextCorpus(blocks), all);
}

/**
 * Paths the tool-card gallery should hide: already in reply prose, or about to
 * appear in the capped auto-fallback (overflow may still show on the card).
 */
export function resolveSuppressArtifactPathsForToolCards(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
  missingForFallback: string[] = resolveMissingArtifactPathsForReply(
    blocks,
    toolResultMap,
  ),
): string[] {
  const embedded = collectEmbeddedArtifactPaths(assistantTextCorpus(blocks));
  const fallbackShown = missingForFallback.slice(0, CHAT_ARTIFACT_AUTO_CAP);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of [...embedded, ...fallbackShown]) {
    const n = normalizeArtifactSlash(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** @deprecated */
export function resolveMissingFigurePathsForReply(
  blocks: ContentBlock[],
  toolResultMap: Map<string, ContentBlock>,
): string[] {
  return resolveMissingArtifactPathsForReply(blocks, toolResultMap);
}
