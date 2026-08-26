import type { AgentStatus } from "../../shared/agent/api";
import { parseRemoteAbs } from "../../shared/remote";

const conversationProfiles = new Map<string, string>();

export const DESKTOP_ONLY_AGENT_METHODS = [
  "agent:listModels",
  "agent:listModelsCatalog",
  "agent:testConnection",
  "agent:getModelEffort",
  "agent:getEffortCatalog",
  "agent:describeImages",
] as const;

export const HOST_AGENT_METHODS = [
  "agent:status",
  "agent:send",
  "agent:cancel",
  "agent:cancelSubagent",
  "agent:dispose",
  "agent:resolvePermission",
  "agent:listSessions",
  "agent:listSessionsByProjectId",
  "agent:loadSession",
  "agent:renameSession",
  "agent:generateSessionTitle",
  "agent:reassignSessionProject",
  "agent:deleteSession",
  "agent:answerQuestion",
  "agent:resolvePlanSuggest",
  "agent:compact",
  "agent:truncateToTurn",
  "agent:undoTruncate",
  "agent:reassignDirectory",
  "agent:syncIntensiveReading",
  "agent:getPlanEvents",
  "agent:upsertPlanArtifact",
  "agent:appendPlanDecision",
  "agent:markPlanArtifactDiscarded",
  "agent:upsertTurnMeta",
] as const;

export type HostAgentMethod = (typeof HOST_AGENT_METHODS)[number];

export function isDesktopOnlyAgentMethod(method: string): boolean {
  return (DESKTOP_ONLY_AGENT_METHODS as readonly string[]).includes(method);
}

export function isHostAgentMethod(method: string): method is HostAgentMethod {
  return (HOST_AGENT_METHODS as readonly string[]).includes(method);
}

/** Status-dot / sidebar polls before SSH is up must not throw. */
export function disconnectedRemoteAgentStatus(projectRoot?: string | null): AgentStatus {
  return {
    ready: false,
    reason: "remote_not_connected",
    sdk: "remote-host",
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron ?? "unknown",
    canEmbed: true,
    hasApiKey: false,
    projectRoot: projectRoot ?? null,
    sessionId: null,
    tools: [],
    permissionMode: "edit_auto",
  };
}

export function rememberRemoteConversation(conversationId: string, profileId: string): void {
  const id = conversationId.trim();
  const alias = profileId.trim();
  if (id && alias) conversationProfiles.set(id, alias);
}

export function forgetRemoteConversation(conversationId: string): void {
  conversationProfiles.delete(conversationId.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function rewriteAgentParamsForHost(params: unknown, remoteRoot?: string): Record<string, unknown> {
  const rec = asRecord(params) ?? {};
  const next = { ...rec };
  for (const key of ["projectRoot", "boundCheckoutPath"] as const) {
    const value = rec[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) next[key] = parsed.abs;
  }
  if (remoteRoot && typeof next.projectRoot !== "string") {
    next.projectRoot = remoteRoot;
  }
  return next;
}

export function remoteProfileIdFromAgentArgs(
  args: unknown,
  lookupProjectId?: (projectId: string) => string | null,
): string | null {
  const rec = asRecord(args);
  if (!rec) return null;
  for (const key of ["projectRoot", "boundCheckoutPath"] as const) {
    const value = rec[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) return parsed.profileId;
  }
  if (typeof rec.conversationId === "string") {
    const mapped = conversationProfiles.get(rec.conversationId.trim());
    if (mapped) return mapped;
  }
  if (typeof rec.tabId === "string") {
    const mapped = conversationProfiles.get(rec.tabId.trim());
    if (mapped) return mapped;
  }
  if (typeof rec.projectId === "string" && lookupProjectId) {
    return lookupProjectId(rec.projectId.trim());
  }
  return null;
}
