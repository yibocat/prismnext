import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentService,
  HOST_SYSTEM_IDENTITY,
  type AgentService,
} from "../main/agent/agent-service";
import { resolveWorkbenchHome } from "../main/workbench/home";
import { parseRemoteAbs } from "../shared/remote";
import type { HostHandlerContext } from "./context";
import { createFrameSink } from "./frame-sink";
import { readHostModelSettings } from "./model-settings";
import { acceptModelProxyPush } from "./model-proxy-transport";

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

export function bootHostAgent(ctx: HostHandlerContext): AgentService {
  const home = resolveWorkbenchHome();
  const remoteKeys = ctx.modelKeys === "remote";
  const agent = createAgentService({
    userDataDir: home,
    modelTransport: remoteKeys ? "direct" : "proxy",
    pendingRemoteModules: true,
    remoteJobNote: true,
    getSettings: () => readHostModelSettings(),
    composeStableSystem: async () => HOST_SYSTEM_IDENTITY,
    composeProjectRules: async (projectRoot) => (
      readOptional(join(projectRoot, ".workbench", "agent", "rules", "project", "RULE.md"))
    ),
    composeAgentsMd: async (projectRoot) => (
      readOptional(join(projectRoot, ".workbench", "agent", "AGENTS.md"))
    ),
  });
  agent.attachSink(createFrameSink(ctx));
  ctx.agent = agent;
  return agent;
}

function requireAgent(ctx: HostHandlerContext): AgentService {
  if (!ctx.agent) throw new Error("Host agent is not booted.");
  return ctx.agent;
}

function params(raw: Record<string, unknown>, ctx: HostHandlerContext): Record<string, unknown> {
  const next = { ...raw };
  const root = ctx.remoteRoot
    || (typeof raw.projectRoot === "string" ? parseRemoteAbs(raw.projectRoot)?.abs : null)
    || (typeof raw.boundCheckoutPath === "string" ? parseRemoteAbs(raw.boundCheckoutPath)?.abs : null);
  if (root) {
    if (typeof raw.projectRoot === "string") next.projectRoot = root;
    if (typeof raw.boundCheckoutPath === "string") next.boundCheckoutPath = root;
  }
  return next;
}

export const agentHandlers: Record<
  string,
  (input: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "agent:status"(input, ctx) {
    const localized = params(input, ctx);
    return requireAgent(ctx).status(
      typeof localized.projectRoot === "string" ? localized.projectRoot : ctx.remoteRoot,
      typeof localized.sessionTeamId === "string" ? localized.sessionTeamId : null,
    );
  },
  async "agent:send"(input, ctx) {
    return requireAgent(ctx).send(params(input, ctx) as never);
  },
  async "agent:cancel"(input, ctx) {
    await requireAgent(ctx).cancel(String(input.conversationId ?? ""));
    return { ok: true };
  },
  async "agent:cancelSubagent"(input, ctx) {
    return {
      ok: requireAgent(ctx).cancelSubagent(String(input.conversationId ?? ""), String(input.toolCallId ?? "")),
    };
  },
  async "agent:dispose"(input, ctx) {
    await requireAgent(ctx).reset(typeof input.conversationId === "string" ? input.conversationId : undefined);
    return { ok: true };
  },
  async "agent:resolvePermission"(input, ctx) {
    return {
      ok: requireAgent(ctx).resolvePermission(
        String(input.requestId ?? ""),
        input.decision === "allow" ? "allow" : "deny",
      ),
    };
  },
  async "agent:listSessions"(input, ctx) {
    const localized = params(input, ctx);
    return requireAgent(ctx).listSessions(String(localized.projectRoot ?? ctx.remoteRoot ?? ""));
  },
  async "agent:listSessionsByProjectId"(input, ctx) {
    return requireAgent(ctx).listSessionsByProjectId(String(input.projectId ?? ctx.projectId ?? ""));
  },
  async "agent:loadSession"(input, ctx) {
    return requireAgent(ctx).loadSession(params(input, ctx) as never);
  },
  async "agent:renameSession"(input, ctx) {
    return requireAgent(ctx).renameSession(input as never);
  },
  async "agent:generateSessionTitle"(input, ctx) {
    return requireAgent(ctx).generateSessionTitle(input as never);
  },
  async "agent:reassignSessionProject"(input, ctx) {
    return requireAgent(ctx).reassignSessionProject(params(input, ctx) as never);
  },
  async "agent:deleteSession"(input, ctx) {
    return requireAgent(ctx).deleteSession(input as never);
  },
  async "agent:answerQuestion"(input, ctx) {
    return { ok: requireAgent(ctx).answerQuestion(input as never) };
  },
  async "agent:resolvePlanSuggest"(input, ctx) {
    return { ok: requireAgent(ctx).resolvePlanSuggest(input as never) };
  },
  async "agent:compact"(input, ctx) {
    return requireAgent(ctx).compact(input as never);
  },
  async "agent:truncateToTurn"(input, ctx) {
    return requireAgent(ctx).truncateToTurn(input as never);
  },
  async "agent:undoTruncate"(input, ctx) {
    return requireAgent(ctx).undoTruncate(input as never);
  },
  async "agent:reassignDirectory"(input, ctx) {
    return requireAgent(ctx).reassignDirectory(params(input, ctx) as never);
  },
  async "agent:syncIntensiveReading"(input, ctx) {
    return requireAgent(ctx).syncIntensiveReading(input as never);
  },
  async "agent:getPlanEvents"(input, ctx) {
    return requireAgent(ctx).getPlanEvents(String(input.conversationId ?? ""));
  },
  async "agent:upsertPlanArtifact"(input, ctx) {
    return requireAgent(ctx).upsertPlanArtifact(input as never);
  },
  async "agent:appendPlanDecision"(input, ctx) {
    return requireAgent(ctx).appendPlanDecision(input as never);
  },
  async "agent:markPlanArtifactDiscarded"(input, ctx) {
    return requireAgent(ctx).markPlanArtifactDiscarded(String(input.conversationId ?? ""));
  },
  async "agent:upsertTurnMeta"(input, ctx) {
    return requireAgent(ctx).upsertTurnMeta(input as never);
  },
  async "model.proxy.push"(input) {
    return acceptModelProxyPush(input);
  },
};
