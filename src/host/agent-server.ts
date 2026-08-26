import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAgentService,
  HOST_SYSTEM_IDENTITY,
  type AgentService,
} from "../main/agent/agent-service";
import { resolveWorkbenchHome } from "../main/workbench/home";
import { hostModelProviderIds, parseRemoteAbs, remapHostMissingApiKey } from "../shared/remote";
import type { HostHandlerContext } from "./context";
import { createFrameSink } from "./frame-sink";
import { readHostModelSettings } from "./model-settings";
import { readHostPermissions } from "./host-permissions";
import { SESSION_MUTATED_CHANNEL } from "../shared/remote";
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
    remoteJobNote: false,
    getSettings: () => ({ ...readHostModelSettings(), ...readHostPermissions() }),
    composeStableSystem: async () => HOST_SYSTEM_IDENTITY,
    composeProjectRules: async (projectRoot) => (
      readOptional(join(projectRoot, ".workbench", "agent", "rules", "project", "RULE.md"))
    ),
    composeAgentsMd: async (projectRoot) => (
      readOptional(join(projectRoot, ".workbench", "agent", "AGENTS.md"))
    ),
  });
  const sink = createFrameSink(ctx);
  agent.attachSink({
    emit(channel, payload) {
      sink.emit(channel, payload);
      if (channel !== "agent:event" || !payload || typeof payload !== "object") return;
      const rec = payload as { type?: string; conversationId?: string; sessionId?: string };
      if (rec.type !== "turn_finished") return;
      const conversationId = rec.conversationId || rec.sessionId;
      if (!conversationId) return;
      ctx.emit(SESSION_MUTATED_CHANNEL, {
        conversationId,
        projectId: ctx.projectId ?? "",
        updatedAt: new Date().toISOString(),
        action: "turn_finished",
      });
    },
  });
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
    const localized = params(input, ctx);
    const result = await requireAgent(ctx).send(localized as never) as { ok?: boolean; error?: string };
    if (result && result.ok === false && typeof result.error === "string") {
      return {
        ...result,
        error: remapHostMissingApiKey(
          result.error,
          typeof localized.provider === "string" ? localized.provider : "",
          hostModelProviderIds(readHostModelSettings().aiApiKeys),
        ),
      };
    }
    return result;
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
    const result = requireAgent(ctx).renameSession(input as never);
    ctx.emit(SESSION_MUTATED_CHANNEL, {
      conversationId: String(input.conversationId ?? ""),
      projectId: ctx.projectId ?? "",
      updatedAt: new Date().toISOString(),
      action: "rename",
    });
    return result;
  },
  async "agent:generateSessionTitle"(input, ctx) {
    return requireAgent(ctx).generateSessionTitle(input as never);
  },
  async "agent:reassignSessionProject"(input, ctx) {
    return requireAgent(ctx).reassignSessionProject(params(input, ctx) as never);
  },
  async "agent:deleteSession"(input, ctx) {
    const result = requireAgent(ctx).deleteSession(input as never);
    ctx.emit(SESSION_MUTATED_CHANNEL, {
      conversationId: String(input.conversationId ?? input.tabId ?? ""),
      projectId: ctx.projectId ?? "",
      updatedAt: new Date().toISOString(),
      action: "delete",
    });
    return result;
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
