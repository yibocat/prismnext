import type { PermissionMode } from "./session-agent";

export interface AgentAuthInput {
  provider?: string;
  modelId?: string;
  apiKey?: string;
  settings: {
    aiProvider?: string;
    aiModel?: string | null;
    aiApiKeys?: Record<string, string>;
  };
}

export type AgentAuthResult =
  | { ok: true; provider: string; modelId: string; apiKey: string }
  | { ok: false; reason: string };

export interface AgentRosterEntrySummary {
  fqid: string;
  name: string;
  available: boolean;
  unavailableReason?: string;
}

export interface AgentStatus {
  ready: boolean;
  reason?: string;
  sdk: string;
  nodeVersion: string;
  electronVersion: string;
  canEmbed: boolean;
  provider?: string;
  modelId?: string;
  hasApiKey: boolean;
  projectRoot?: string | null;
  sessionId?: string | null;
  teamId?: string;
  leadName?: string;
  leadFqid?: string;
  roster?: AgentRosterEntrySummary[];
  tools: string[];
  permissionMode: PermissionMode;
}

export interface AgentModelCost {
  /** USD per million input tokens. */
  input?: number;
  /** USD per million output tokens. */
  output?: number;
  /** USD per million cache-read tokens. */
  cacheRead?: number;
  /** USD per million cache-write tokens. */
  cacheWrite?: number;
}

export interface AgentModelRow {
  id: string;
  name: string;
  contextWindow: string;
  capabilities?: { vision?: boolean };
  description?: string;
  efforts?: string[];
  /** Max output tokens formatted for display, e.g. "128K". */
  maxTokens?: string;
  /** Max output tokens as a raw number (for tooltips / math). */
  maxTokensNum?: number;
  /** USD per million tokens, when the Pi catalog publishes it. */
  cost?: AgentModelCost;
}

export interface AgentListModelsInput {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface AgentListModelsResult {
  models: AgentModelRow[];
  source: "pi" | "api";
}

export interface AgentModelsCatalogSnapshot {
  entries: Record<string, AgentModelRow[]>;
  fetchedAt: number;
}

export interface AgentTestConnectionInput {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}

export interface AgentTestConnectionResult {
  success: boolean;
  models?: string[];
}

export interface AgentModelEffortInput {
  provider: string;
  modelId: string;
  fallback?: string[] | null;
}

export interface AgentModelEffortResult {
  efforts: string[];
  source: "pi" | "fallback" | "none";
}

export interface AgentEffortCatalogSnapshot {
  entries: Record<string, string[]>;
  fetchedAt: number;
}

export interface AgentDescribeImagesInput {
  providerId: string;
  modelId: string;
  images: Array<{ name: string; mimeType: string; data: string; uri?: string }>;
}

export interface AgentDescribeImagesResult {
  descriptions: Array<{ name: string; text: string; cached: boolean }>;
}
