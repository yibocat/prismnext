/**
 * Live Pi session → occupancy, cumulative spend, and a Cursor-like breakdown.
 *
 * Provider usage has no system/tools/skills buckets. We estimate those from the
 * prompt Pi actually assembled, then fit the bar to Pi's occupancy total.
 */

import { countPromptTokens } from "../lib/token-estimate";
import { isMcpToolName } from "./mcp-host";
import {
  estimateCostUsd,
  fitBreakdownToOccupancy,
  type ContextUsageBreakdown,
  type SessionUsageTotals,
} from "../../shared/agent/context-usage";

const SUBAGENT_HEADING = "## Available subagents (via Task)";

export interface PiContextSnapshotSession {
  getSessionStats?: () => {
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
    cost: number;
  };
  /** @deprecated Tests / older fakes. Prefer getSessionStats. */
  getStats?: () => {
    tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
    cost: number;
  };
  getContextUsage?: () => {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  } | undefined;
  systemPrompt?: string;
  getAllTools?: () => Array<{
    name: string;
    description?: string;
    parameters?: unknown;
  }>;
  sessionManager?: {
    getEntries?: () => Array<{ type?: string; summary?: string }>;
    getBranch?: () => Array<{ type?: string; summary?: string }>;
  };
  model?: {
    contextWindow?: number;
    cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  };
}

export interface PiUsageSnapshot extends SessionUsageTotals {}

function countText(text: string): number {
  if (!text) return 0;
  return countPromptTokens(text).tokenCount;
}

function spliceOut(source: string, from: number, end: number): { block: string; rest: string } {
  return {
    block: source.slice(from, end),
    rest: `${source.slice(0, from)}${source.slice(end)}`.replace(/\n{3,}/g, "\n\n").trim(),
  };
}

function extractBlock(source: string, start: string, end: string): { block: string; rest: string } {
  const from = source.indexOf(start);
  if (from < 0) return { block: "", rest: source };
  const to = source.indexOf(end, from + start.length);
  const endAt = to >= 0 ? to + end.length : source.length;
  return spliceOut(source, from, endAt);
}

function extractSkills(source: string): { block: string; rest: string } {
  const startTag = source.indexOf("<available_skills>");
  if (startTag < 0) return { block: "", rest: source };
  const introMark = "The following skills provide specialized instructions";
  const introAt = source.lastIndexOf(introMark, startTag);
  const from = introAt >= 0 && startTag - introAt < 800 ? introAt : startTag;
  const endTag = "</available_skills>";
  const to = source.indexOf(endTag, startTag);
  const endAt = to >= 0 ? to + endTag.length : source.length;
  return spliceOut(source, from, endAt);
}

function extractFromHeading(source: string, heading: string): { block: string; rest: string } {
  const from = source.indexOf(heading);
  if (from < 0) return { block: "", rest: source };
  const next = source.indexOf("\n## ", from + heading.length);
  const endAt = next >= 0 ? next : source.length;
  return spliceOut(source, from, endAt);
}

function toolSchemaText(tool: { name: string; description?: string; parameters?: unknown }): string {
  try {
    return JSON.stringify({
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.parameters ?? {},
    });
  } catch {
    return `${tool.name}\n${tool.description ?? ""}`;
  }
}

function latestCompactionSummary(session: PiContextSnapshotSession): string {
  const entries = session.sessionManager?.getBranch?.()
    ?? session.sessionManager?.getEntries?.()
    ?? [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type === "compaction" && typeof entry.summary === "string" && entry.summary.trim()) {
      return entry.summary;
    }
  }
  return "";
}

export function estimateContextBreakdown(
  session: PiContextSnapshotSession,
  occupancy: number | null,
): ContextUsageBreakdown {
  let system = typeof session.systemPrompt === "string" ? session.systemPrompt : "";

  const skillsExtract = extractSkills(system);
  system = skillsExtract.rest;
  const rulesExtract = extractBlock(system, "<project_context>", "</project_context>");
  system = rulesExtract.rest;
  const subagentsExtract = extractFromHeading(system, SUBAGENT_HEADING);
  system = subagentsExtract.rest;

  const tools = session.getAllTools?.() ?? [];
  let toolsText = "";
  let mcpText = "";
  for (const tool of tools) {
    const chunk = toolSchemaText(tool);
    if (isMcpToolName(tool.name)) mcpText += `${chunk}\n`;
    else toolsText += `${chunk}\n`;
  }

  const parts: ContextUsageBreakdown = {
    systemPrompt: countText(system),
    tools: countText(toolsText),
    rules: countText(rulesExtract.block),
    skills: countText(skillsExtract.block),
    mcp: countText(mcpText),
    subagents: countText(subagentsExtract.block),
    summarized: countText(latestCompactionSummary(session)),
  };

  return fitBreakdownToOccupancy(parts, occupancy);
}

export function snapshotPiSessionUsage(
  session: PiContextSnapshotSession | null | undefined,
  opts?: {
    occupancy?: number | null;
    includeBreakdown?: boolean;
    /** Keep this spend across a model switch when Pi has no in-band bill. */
    previousCostUsd?: number;
  },
): PiUsageSnapshot | null {
  if (!session) return null;
  const stats = session.getSessionStats?.() ?? session.getStats?.();
  const context = session.getContextUsage?.();
  const occupancy = context && context.tokens != null && context.tokens > 0
    ? Math.round(context.tokens)
    : (opts?.occupancy ?? null);
  const windowSize = (context?.contextWindow && context.contextWindow > 0)
    ? context.contextWindow
    : (typeof session.model?.contextWindow === "number" && session.model.contextWindow > 0
      ? session.model.contextWindow
      : null);
  const billed = typeof stats?.cost === "number" && Number.isFinite(stats.cost) ? stats.cost : 0;
  const estimated = stats
    ? estimateCostUsd(stats.tokens, session.model?.cost)
    : 0;
  const previous = typeof opts?.previousCostUsd === "number" && opts.previousCostUsd > 0
    ? opts.previousCostUsd
    : 0;
  const costUsd = billed > 0 ? billed : (previous > 0 ? previous : estimated);
  const hasAnything = occupancy != null || costUsd > 0 || stats != null || windowSize != null;
  if (!hasAnything) return null;

  return {
    occupancyTokens: occupancy,
    windowSize,
    costUsd,
    input: stats?.tokens.input ?? 0,
    output: stats?.tokens.output ?? 0,
    cacheRead: stats?.tokens.cacheRead ?? 0,
    cacheWrite: stats?.tokens.cacheWrite ?? 0,
    ...(opts?.includeBreakdown ? { breakdown: estimateContextBreakdown(session, occupancy) } : {}),
    updatedAt: Date.now(),
  };
}
