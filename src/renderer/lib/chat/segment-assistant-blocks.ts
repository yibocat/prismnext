/**
 * Split assistant blocks into prose vs activity (thinking + tools).
 *
 * One tree for live and settled: contiguous thinking/tools → burst folds;
 * Task standalone; prose stays outside. Settling only changes chrome, never remounts.
 */
import type { ContentBlock } from "@/stores/chat-store";
import {
  param,
  computeLineDiffStats,
  computePatchLineStats,
  toolUseActivityLabel,
} from "@/components/modules/chat/tools/shared";
import { extractPatchTargetPaths } from "@/components/modules/chat/tools/tool-meta";
import { activitySpanSecFromBlocks } from "@shared/chat-block-time";

export type TextSegment = {
  kind: "text";
  blockIndex: number;
  block: ContentBlock;
};

export type ActivitySegment = {
  kind: "activity";
  blockIndices: number[];
  blocks: ContentBlock[];
};

/** Task / subagent card — outside the Planning/Exploring fold. */
export type StandaloneToolSegment = {
  kind: "tool";
  blockIndex: number;
  block: ContentBlock;
};

/** Inner segments of a settled Worked-for wrapper (never nests another worked). */
export type WorkedChildSegment =
  | TextSegment
  | ActivitySegment
  | StandaloneToolSegment;

/**
 * Settled whole-turn process wrapper. Children keep the live burst / Task /
 * interim-prose segmentation — only the outer chrome is Worked for.
 */
export type WorkedSegment = {
  kind: "worked";
  children: WorkedChildSegment[];
  /** Flat process blocks for duration / inventory on the outer header. */
  blocks: ContentBlock[];
  blockIndices: number[];
};

export type AssistantSegment =
  | TextSegment
  | ActivitySegment
  | StandaloneToolSegment
  | WorkedSegment;

function isQuestionToolBlock(block: ContentBlock): boolean {
  if (block.type !== "tool_use") return false;
  const name = (block.name || block._backfillName || "").toLowerCase();
  return name === "question" || name === "ask_question";
}

function isStandaloneToolBlock(block: ContentBlock): boolean {
  if (block.type !== "tool_use") return false;
  const name = (block.name || block._backfillName || "").toLowerCase();
  return name === "task" || isQuestionToolBlock(block);
}

function isActivityBlock(block: ContentBlock): boolean {
  if (isStandaloneToolBlock(block)) return false;
  if (block.type === "tool_use") return true;
  if (block.type === "thinking" && block.thinking?.trim()) return true;
  return false;
}

function hasTextContent(block: ContentBlock): boolean {
  return block.type === "text" && !!block.text?.trim();
}

export type ActivityPhase = "live" | "settled";

export type SegmentAssistantBlocksOptions = {
  /** live while streaming; settled after turn ends / history (default settled). */
  phase?: ActivityPhase;
};

/** Ordered prose / activity / standalone-tool segments preserving block order. */
export function segmentAssistantBlocks(
  blocks: ContentBlock[],
  _options?: SegmentAssistantBlocksOptions,
): AssistantSegment[] {
  return segmentAssistantBlocksLive(blocks);
}

/** Persist / React key: turn + first block index. Never include live|settled. */
export function activityFoldPersistKey(turnId: string, firstBlockIndex: number): string {
  return `${turnId}:a${firstBlockIndex}`;
}

/**
 * Burst is streaming only while this turn is live AND the burst itself is unsealed
 * (a tool still running, or the last thinking has no duration/timeEnd).
 * A later prose / burst / Task segment means this burst already ended.
 */
export function isActivityBurstStreaming(
  blocks: ContentBlock[],
  turnLive: boolean,
  opts?: { hasLaterSegment?: boolean },
): boolean {
  if (!turnLive) return false;
  if (blocks.some((block) => block.type === "tool_use" && block.status === "running")) {
    return true;
  }
  if (opts?.hasLaterSegment) return false;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]!;
    if (block.type === "thinking") {
      return typeof block.duration !== "number" && typeof block.timeEnd !== "number";
    }
    if (block.type === "tool_use") return false;
  }
  return false;
}

/** Live: burst folds + standalone Task; AI prose stays outside between bursts. */
function segmentAssistantBlocksLive(blocks: ContentBlock[]): AssistantSegment[] {
  if (blocks.length === 0) return [];

  const out: AssistantSegment[] = [];
  let activityIndices: number[] = [];
  let activityBlocks: ContentBlock[] = [];

  const flushActivity = () => {
    if (activityBlocks.length === 0) return;
    out.push({
      kind: "activity",
      blockIndices: activityIndices,
      blocks: activityBlocks,
    });
    activityIndices = [];
    activityBlocks = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (isStandaloneToolBlock(block)) {
      flushActivity();
      out.push({ kind: "tool", blockIndex: i, block });
      continue;
    }
    if (isActivityBlock(block)) {
      activityIndices.push(i);
      activityBlocks.push(block);
      continue;
    }
    if (hasTextContent(block)) {
      flushActivity();
      out.push({ kind: "text", blockIndex: i, block });
    }
  }
  flushActivity();
  return out;
}

export function countActivityTools(blocks: ContentBlock[]): number {
  return blocks.filter((b) => b.type === "tool_use").length;
}

export function countActivityThinking(blocks: ContentBlock[]): number {
  return blocks.filter((b) => b.type === "thinking" && b.thinking?.trim()).length;
}

/** Sum persisted thinking durations (seconds) inside a segment. */
export function sumThinkingDurations(blocks: ContentBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    if (block.type !== "thinking") continue;
    if (typeof block.duration === "number" && Number.isFinite(block.duration)) {
      total += block.duration;
    }
  }
  return total;
}

/** Sum persisted tool + thinking durations (seconds). */
export function sumActivityBlockDurations(blocks: ContentBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    if (block.type !== "thinking" && block.type !== "tool_use") continue;
    if (typeof block.duration === "number" && Number.isFinite(block.duration)) {
      total += block.duration;
    }
  }
  return total;
}

/**
 * Best available activity duration for a completed segment:
 * OpenCode wall span → sum of block durations → undefined (no inventing).
 */
export function resolveActivityDurationSec(blocks: ContentBlock[]): number | undefined {
  const span = activitySpanSecFromBlocks(blocks);
  if (span != null && span > 0) return span;
  const sum = sumActivityBlockDurations(blocks);
  if (sum > 0) return sum;
  const thinkingOnly = sumThinkingDurations(blocks);
  return thinkingOnly > 0 ? thinkingOnly : undefined;
}

/** Whether this thinking block is still the open (live) one in a streaming activity segment. */
export function isThinkingBlockStreaming(
  blocks: ContentBlock[],
  index: number,
  segmentStreaming: boolean,
): boolean {
  if (!segmentStreaming) return false;
  const block = blocks[index];
  if (!block || block.type !== "thinking" || block._progress) return false;
  if (typeof block.duration === "number" && Number.isFinite(block.duration)) return false;
  for (let j = index + 1; j < blocks.length; j++) {
    const b = blocks[j]!;
    if (b.type === "tool_use") return false;
    if (b.type === "thinking" && b.thinking?.trim()) return false;
    if (b.type === "text" && b.text?.trim()) return false;
  }
  return true;
}

export function formatActivityDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.1s";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (rem <= 0) return `${minutes}m`;
  return `${minutes}m ${rem}s`;
}

/** Short label for the latest block while streaming (tool target or thinking). */
export function describeLatestActivityBlock(block: ContentBlock | undefined): string | null {
  if (!block) return null;
  if (block.type === "thinking") {
    return block._progress ? "Initialization" : "Thinking";
  }
  if (block.type !== "tool_use") return null;
  return toolUseActivityLabel(block);
}

/** Cursor-style burst phase — not the final-turn "Worked for" summary. */
export type ActivityBurstPhase = "planning" | "exploring" | "editing" | "executing";

const EXPLORE_TOOL_NAMES = new Set([
  "read",
  "grep",
  "glob",
  "list",
  "webfetch",
  "websearch",
  "web_search",
  "literature-search",
  "literature-discover",
  "literature-read",
  "literature-cite",
  "literature-stage",
  "lsp",
  "semanticsearch",
  "research-brief-read",
]);

const EDIT_TOOL_NAMES = new Set([
  "write",
  "edit",
  "multiedit",
  "patch",
  "apply_patch",
  "delete",
  "move",
]);

const EXECUTE_TOOL_NAMES = new Set([
  "bash",
  "shell",
  "terminal",
  "execute",
]);

const PLAN_TOOL_NAMES = new Set([
  "todowrite",
  "todoread",
  "todo",
  "plan",
  "question",
  "ask_question",
]);

function toolBurstBucket(name: string): ActivityBurstPhase {
  const n = name.toLowerCase();
  if (EXECUTE_TOOL_NAMES.has(n)) return "executing";
  if (
    EDIT_TOOL_NAMES.has(n)
    || n.includes("edit")
    || n.includes("write")
    || n.includes("delete")
    || n.includes("patch")
  ) {
    return "editing";
  }
  if (PLAN_TOOL_NAMES.has(n)) return "planning";
  if (EXPLORE_TOOL_NAMES.has(n) || n.startsWith("literature")) return "exploring";
  // Unknown tools default to explore (read-ish) rather than "Working…".
  return "exploring";
}

/**
 * Dominant phase for a contiguous thought/tool burst.
 * Priority: executing > editing > exploring > planning.
 */
export function resolveActivityBurstPhase(blocks: ContentBlock[]): ActivityBurstPhase {
  let hasExecute = false;
  let hasEdit = false;
  let hasExplore = false;
  let hasPlan = false;
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const name = block.name || block._backfillName || "";
    const bucket = toolBurstBucket(name);
    if (bucket === "executing") hasExecute = true;
    else if (bucket === "editing") hasEdit = true;
    else if (bucket === "planning") hasPlan = true;
    else hasExplore = true;
  }
  if (hasExecute) return "executing";
  if (hasEdit) return "editing";
  if (hasExplore) return "exploring";
  if (hasPlan) return "planning";
  return "planning";
}

export type ActivitySummaryInput = {
  blocks: ContentBlock[];
  isStreaming: boolean;
  elapsedSec?: number;
  /** Whole-turn settled fold — always Thought for / Worked for (not burst phases). */
  turnSettled?: boolean;
  labels: {
    thinking: string;
    thoughtFor: (duration: string) => string;
    planning: string;
    exploring: string;
    editing: string;
    executing: string;
    plannedFor: (duration: string, toolCount: number) => string;
    exploredFor: (duration: string, toolCount: number) => string;
    editedFor: (duration: string, toolCount: number) => string;
    executedFor: (duration: string, toolCount: number) => string;
    /** Whole-turn Worked for — duration only (no tool count). */
    workedFor: (duration: string) => string;
  };
};

export function buildActivitySummaryLine(input: ActivitySummaryInput): string {
  const { blocks, isStreaming, elapsedSec, turnSettled, labels } = input;
  const toolCount = countActivityTools(blocks);
  const thinkingCount = countActivityThinking(blocks);
  const last = blocks[blocks.length - 1];
  const lastHint = describeLatestActivityBlock(last);
  const phase = resolveActivityBurstPhase(blocks);

  const resolved =
    typeof elapsedSec === "number" && elapsedSec > 0
      ? elapsedSec
      : resolveActivityDurationSec(blocks);
  const durationSec = resolved ?? 0;
  const durationLabel = durationSec > 0 ? formatActivityDuration(durationSec) : "";

  if (isStreaming) {
    const tail = lastHint ? ` · ${lastHint}` : "";
    if (toolCount === 0 && thinkingCount > 0) {
      if (durationSec > 0.8 && durationLabel) {
        return `${labels.thinking} ${durationLabel}${tail}`;
      }
      return `${labels.thinking}${tail}`;
    }
    const live =
      phase === "executing"
        ? labels.executing
        : phase === "editing"
          ? labels.editing
          : phase === "exploring"
            ? labels.exploring
            : labels.planning;
    return `${live}${tail}`;
  }

  if (toolCount === 0 && thinkingCount > 0) {
    return labels.thoughtFor(durationLabel || formatActivityDuration(0.1));
  }

  const dur = durationLabel || "—";
  if (turnSettled) {
    return labels.workedFor(dur);
  }
  if (phase === "executing") return labels.executedFor(dur, toolCount);
  if (phase === "editing") return labels.editedFor(dur, toolCount);
  if (phase === "exploring") return labels.exploredFor(dur, toolCount);
  return labels.plannedFor(dur, toolCount);
}

// ─── Cursor-style inventory (Edited N files, explored…, +/−) ─────────

export type ActivityBurstInventory = {
  editedFiles: number;
  exploredFiles: number;
  searches: number;
  commands: number;
  lints: number;
  added: number;
  removed: number;
};

function emptyInventory(): ActivityBurstInventory {
  return {
    editedFiles: 0,
    exploredFiles: 0,
    searches: 0,
    commands: 0,
    lints: 0,
    added: 0,
    removed: 0,
  };
}

function addUniquePath(set: Set<string>, path: string, fallbackKey: string) {
  const key = path.trim() || fallbackKey;
  if (key) set.add(key);
}

function toolUseName(block: ContentBlock): string {
  return (block.name || block._backfillName || "").toLowerCase();
}

function toolFilePath(block: ContentBlock): string {
  const input = (block.input ?? block._backfillInput) as Record<string, unknown> | undefined;
  return (
    param(input, "file_path", "filePath")
    || param(input, "path")
    || ""
  ).trim();
}

/** Aggregate tool counts + edit +/- for one activity fold. */
export function collectActivityBurstInventory(
  blocks: ContentBlock[],
): ActivityBurstInventory {
  const inv = emptyInventory();
  const edited = new Set<string>();
  const explored = new Set<string>();

  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const name = toolUseName(block);
    const input = (block.input ?? block._backfillInput) as Record<string, unknown> | undefined;
    const id = block.id || `${name}:${edited.size + explored.size}`;

    if (
      name === "edit"
      || name === "multiedit"
      || name.endsWith("edit")
      || name.includes("multiedit")
    ) {
      addUniquePath(edited, toolFilePath(block), `edit:${id}`);
      const oldStr = param(input, "old_string", "oldString") ?? "";
      const newStr =
        param(input, "new_string", "newString")
        || param(input, "content")
        || "";
      if (oldStr || newStr) {
        const stats = computeLineDiffStats(oldStr, newStr);
        inv.added += stats.added;
        inv.removed += stats.removed;
      }
      const edits = input?.edits;
      if (Array.isArray(edits)) {
        for (const entry of edits) {
          if (!entry || typeof entry !== "object") continue;
          const e = entry as Record<string, unknown>;
          const o = String(e.old_string ?? e.oldString ?? "");
          const n = String(e.new_string ?? e.newString ?? "");
          if (o || n) {
            const stats = computeLineDiffStats(o, n);
            inv.added += stats.added;
            inv.removed += stats.removed;
          }
        }
      }
      continue;
    }

    if (name === "write" || name.startsWith("write")) {
      addUniquePath(edited, toolFilePath(block), `write:${id}`);
      const content = param(input, "content") || param(input, "new_string", "newString") || "";
      if (content) {
        const stats = computeLineDiffStats("", content);
        inv.added += stats.added;
        inv.removed += stats.removed;
      }
      continue;
    }

    if (name === "patch" || name === "apply_patch") {
      const paths = extractPatchTargetPaths(input);
      if (paths.length > 0) {
        for (const p of paths) addUniquePath(edited, p, `patch:${id}`);
      } else {
        addUniquePath(edited, toolFilePath(block), `patch:${id}`);
      }
      const patch = param(input, "patch") || param(input, "content") || "";
      if (patch) {
        const stats = computePatchLineStats(patch);
        inv.added += stats.added;
        inv.removed += stats.removed;
      }
      continue;
    }

    if (name === "delete" || name === "move") {
      addUniquePath(edited, toolFilePath(block), `${name}:${id}`);
      continue;
    }

    if (name === "read") {
      addUniquePath(explored, toolFilePath(block), `read:${id}`);
      continue;
    }

    if (
      name === "grep"
      || name === "glob"
      || name === "websearch"
      || name === "web_search"
      || name === "literature-search"
      || name === "semanticsearch"
    ) {
      inv.searches += 1;
      continue;
    }

    if (
      name === "bash"
      || name === "shell"
      || name === "terminal"
      || name === "execute"
    ) {
      inv.commands += 1;
      continue;
    }

    if (name === "lsp") {
      inv.lints += 1;
    }
  }

  inv.editedFiles = edited.size;
  inv.exploredFiles = explored.size;
  return inv;
}

export function inventoryHasDetail(inv: ActivityBurstInventory): boolean {
  return (
    inv.editedFiles > 0
    || inv.exploredFiles > 0
    || inv.searches > 0
    || inv.commands > 0
    || inv.lints > 0
  );
}

export type ActivityInventoryLabels = {
  editedFiles: (n: number) => string;
  exploredFiles: (n: number) => string;
  searches: (n: number) => string;
  commands: (n: number) => string;
  lints: string;
};

/** Cursor-style inventory sentence (no +/- — render DiffStatBadge beside it). */
export function formatActivityInventoryLine(
  inv: ActivityBurstInventory,
  labels: ActivityInventoryLabels,
): string {
  const parts: string[] = [];
  if (inv.editedFiles > 0) parts.push(labels.editedFiles(inv.editedFiles));
  if (inv.exploredFiles > 0) parts.push(labels.exploredFiles(inv.exploredFiles));
  if (inv.searches > 0) parts.push(labels.searches(inv.searches));
  if (inv.lints > 0) parts.push(labels.lints);
  if (inv.commands > 0) parts.push(labels.commands(inv.commands));
  if (parts.length === 0) return "";
  const joined = parts.join(", ");
  // English fragments like "explored…" stay lowercase mid-list; capitalize the lead.
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
