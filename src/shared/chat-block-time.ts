/**
 * OpenCode part timing helpers.
 *
 * Tool parts: `state.time = { start, end? }` (ms epoch).
 * Reasoning / text: `time = { start, end? }` (ms epoch).
 */

export type OpenCodeTimeRange = {
  start?: unknown;
  end?: unknown;
};

/** Convert OpenCode ms timestamps to seconds (1 decimal), or undefined if incomplete. */
export function durationSecFromOpenCodeTime(time: unknown): number | undefined {
  if (!time || typeof time !== "object") return undefined;
  const { start, end } = time as OpenCodeTimeRange;
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return Math.round(((end - start) / 1000) * 10) / 10;
}

/** Pull a time range from a tool / reasoning / ACP tool_call-shaped object. */
export function extractOpenCodeTime(part: unknown): unknown {
  if (!part || typeof part !== "object") return undefined;
  const p = part as Record<string, unknown>;
  const state = p.state;
  if (state && typeof state === "object") {
    const st = (state as Record<string, unknown>).time;
    if (st) return st;
  }
  if (p.time) return p.time;
  return undefined;
}

export function durationSecFromOpenCodePart(part: unknown): number | undefined {
  return durationSecFromOpenCodeTime(extractOpenCodeTime(part));
}

/** Wall-clock span across blocks that carry timeStart/timeEnd (ms), in seconds. */
export function activitySpanSecFromBlocks(
  blocks: Array<{ timeStart?: number; timeEnd?: number; duration?: number }>,
): number | undefined {
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const b of blocks) {
    if (typeof b.timeStart === "number" && Number.isFinite(b.timeStart)) {
      minStart = Math.min(minStart, b.timeStart);
    }
    if (typeof b.timeEnd === "number" && Number.isFinite(b.timeEnd)) {
      maxEnd = Math.max(maxEnd, b.timeEnd);
    } else if (
      typeof b.timeStart === "number"
      && typeof b.duration === "number"
      && Number.isFinite(b.duration)
    ) {
      maxEnd = Math.max(maxEnd, b.timeStart + b.duration * 1000);
    }
  }
  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd < minStart) {
    return undefined;
  }
  return Math.round(((maxEnd - minStart) / 1000) * 10) / 10;
}
