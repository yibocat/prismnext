/**
 * Split assistant message blocks into prose vs activity (thinking + tools).
 * Activity segments render inside ActivityFold (Cursor-style "Worked for X").
 */
import type { ContentBlock } from "@/stores/chat-store";
import { param, basenamePath } from "@/components/modules/chat/tools/shared";
import { activitySpanSecFromBlocks } from "@shared/opencode-part-time";

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

export type AssistantSegment = TextSegment | ActivitySegment;

function isActivityBlock(block: ContentBlock): boolean {
  if (block.type === "tool_use") return true;
  if (block.type === "thinking" && block.thinking?.trim()) return true;
  return false;
}

function hasTextContent(block: ContentBlock): boolean {
  return block.type === "text" && !!block.text?.trim();
}

export type SegmentAssistantBlocksOptions = {
  unifiedActivity?: boolean;
  /** While a Task tool_use has no terminal result, keep all prose inside the activity fold. */
  suppressTailUntilTaskSettled?: boolean;
};

/** Ordered prose / activity segments preserving block order. */
export function segmentAssistantBlocks(
  blocks: ContentBlock[],
  options?: SegmentAssistantBlocksOptions,
): AssistantSegment[] {
  if (options?.unifiedActivity) {
    return segmentAssistantBlocksUnified(blocks, options);
  }
  const raw = segmentAssistantBlocksRaw(blocks);
  return coalesceActivitySegments(raw);
}

/**
 * One activity fold for the whole turn: everything before the trailing prose
 * suffix (interim text between tool bursts becomes bridge content inside).
 */
function segmentAssistantBlocksUnified(
  blocks: ContentBlock[],
  options?: SegmentAssistantBlocksOptions,
): AssistantSegment[] {
  if (blocks.length === 0) return [];

  let tailTextStart = blocks.length;
  if (!options?.suppressTailUntilTaskSettled) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (hasTextContent(blocks[i]!)) {
        tailTextStart = i;
        continue;
      }
      break;
    }
  }

  const head = blocks.slice(0, tailTextStart);
  const tail = blocks.slice(tailTextStart).filter((b) => hasTextContent(b));

  const activityIndices: number[] = [];
  const activityBlocks: ContentBlock[] = [];

  for (let i = 0; i < head.length; i++) {
    const block = head[i]!;
    if (isActivityBlock(block)) {
      activityIndices.push(i);
      activityBlocks.push(block);
      continue;
    }
    if (hasTextContent(block)) {
      activityIndices.push(i);
      activityBlocks.push({
        type: "text",
        text: block.text!.trim(),
        _activityBridge: true,
      } as ContentBlock & { _activityBridge?: boolean });
    }
  }

  const out: AssistantSegment[] = [];

  if (activityBlocks.length > 0) {
    out.push({
      kind: "activity",
      blockIndices: activityIndices,
      blocks: activityBlocks,
    });
  }

  for (let i = 0; i < tail.length; i++) {
    const block = tail[i]!;
    out.push({
      kind: "text",
      blockIndex: tailTextStart + i,
      block,
    });
  }

  return out;
}

function isActivityBridgeText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.length <= 3) return true;
  return /^(ok|yes|no|done|\.*|…+)$/i.test(t);
}

function segmentAssistantBlocksRaw(blocks: ContentBlock[]): AssistantSegment[] {
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
    if (hasTextContent(block)) {
      flushActivity();
      out.push({ kind: "text", blockIndex: i, block });
      continue;
    }
    if (isActivityBlock(block)) {
      activityIndices.push(i);
      activityBlocks.push(block);
    }
  }

  flushActivity();
  return out;
}

/** Drop filler prose between activity bursts; merge adjacent activity segments. */
export function coalesceActivitySegments(segments: AssistantSegment[]): AssistantSegment[] {
  if (segments.length <= 1) return segments;

  const merged: AssistantSegment[] = [];
  let pendingActivity: ActivitySegment | null = null;

  const flushPending = () => {
    if (!pendingActivity) return;
    merged.push(pendingActivity);
    pendingActivity = null;
  };

  const mergeIntoPending = (seg: ActivitySegment) => {
    if (!pendingActivity) {
      pendingActivity = seg;
      return;
    }
    pendingActivity = {
      kind: "activity",
      blockIndices: [...pendingActivity.blockIndices, ...seg.blockIndices],
      blocks: [...pendingActivity.blocks, ...seg.blocks],
    };
  };

  for (const seg of segments) {
    if (seg.kind === "activity") {
      mergeIntoPending(seg);
      continue;
    }

    const prose = seg.block.text?.trim() ?? "";
    if (isActivityBridgeText(prose) && pendingActivity) {
      // Hold short bridge text inside the activity burst (shown when expanded).
      pendingActivity.blocks.push({
        type: "text",
        text: prose,
        _activityBridge: true,
      } as ContentBlock & { _activityBridge?: boolean });
      pendingActivity.blockIndices.push(seg.blockIndex);
      continue;
    }

    flushPending();
    merged.push(seg);
  }

  flushPending();
  return merged;
}

function isBridgeTextBlock(block: ContentBlock): boolean {
  return block.type === "text" && (block as ContentBlock & { _activityBridge?: boolean })._activityBridge === true;
}

export function isBridgeTextBlockExported(block: ContentBlock): boolean {
  return isBridgeTextBlock(block);
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
  isBridgeText: (b: ContentBlock) => boolean = isBridgeTextBlock,
): boolean {
  if (!segmentStreaming) return false;
  const block = blocks[index];
  if (!block || block.type !== "thinking" || block._progress) return false;
  if (typeof block.duration === "number" && Number.isFinite(block.duration)) return false;
  for (let j = index + 1; j < blocks.length; j++) {
    const b = blocks[j]!;
    if (b.type === "tool_use") return false;
    if (b.type === "thinking" && b.thinking?.trim()) return false;
    if (b.type === "text" && !isBridgeText(b) && b.text?.trim()) return false;
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

  const name = (block.name || block._backfillName || "tool").toLowerCase();
  const input = (block.input ?? block._backfillInput) as Record<string, unknown> | undefined;

  switch (name) {
    case "read":
    case "write":
    case "edit": {
      const p =
        param(input, "file_path", "filePath")
        || param(input, "path")
        || "";
      return p ? basenamePath(p) : "file";
    }
    case "grep": {
      const pat = param(input, "pattern") || param(input, "query") || "";
      return pat ? `"${pat.slice(0, 40)}${pat.length > 40 ? "…" : ""}"` : "search";
    }
    case "glob": {
      const g = param(input, "glob_pattern", "globPattern") || param(input, "pattern") || "";
      return g || "glob";
    }
    case "bash": {
      const cmd =
        param(input, "command")
        || block.title
        || "";
      const line = cmd.split("\n")[0]?.trim() || "shell";
      return line.length > 48 ? `${line.slice(0, 48)}…` : line;
    }
    case "task": {
      const agent =
        param(input, "agent")
        || param(input, "subagent_type")
        || "task";
      return `@${agent.replace(/^@/, "")}`;
    }
    default: {
      const title = typeof block.title === "string" ? block.title.trim() : "";
      if (title) return title.length > 48 ? `${title.slice(0, 48)}…` : title;
      const idHint = param(input, "id") || param(input, "experiment_id", "experimentId") || "";
      if (idHint) return basenamePath(String(idHint));
      return name;
    }
  }
}

export type ActivitySummaryInput = {
  blocks: ContentBlock[];
  isStreaming: boolean;
  elapsedSec?: number;
  labels: {
    working: string;
    thinking: string;
    thoughtFor: (duration: string) => string;
    workedFor: (duration: string, toolCount: number) => string;
  };
};

export function buildActivitySummaryLine(input: ActivitySummaryInput): string {
  const { blocks, isStreaming, elapsedSec, labels } = input;
  const toolCount = countActivityTools(blocks);
  const thinkingCount = countActivityThinking(blocks);
  const last = blocks[blocks.length - 1];
  const lastHint = describeLatestActivityBlock(last);

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
    return `${labels.working}${tail}`;
  }

  if (toolCount === 0 && thinkingCount > 0) {
    // Never fall back to the live "Thinking…" copy after the turn settles —
    // missing duration still shows Thought for (same 0.1s floor as formatActivityDuration).
    return labels.thoughtFor(durationLabel || formatActivityDuration(0.1));
  }

  // No invented fallbacks (no toolCount×0.4 / text-length guesses).
  return labels.workedFor(durationLabel || "—", toolCount);
}
