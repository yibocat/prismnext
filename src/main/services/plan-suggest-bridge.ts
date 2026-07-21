/**
 * suggest-plan bridge: show consent strip and wait for accept / dismiss / 15s timeout
 * before writing the tool result (model turn stays paused meanwhile).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createLogger } from "./logger";
import { getPlanSuggestBridgeRoot } from "./prism-bridge-paths";
import { resolveChatTabId } from "./chat-session-registry";
import { emitChatStream } from "./chat-stream-notify";
import { AcpService } from "../acp/service";
import {
  buildPlanSuggestAcceptedResult,
  clampPlanSuggestReason,
  PLAN_SUGGEST_TIMEOUT_MS,
  resolvePlanSuggestGate,
  type PlanSuggestDecision,
} from "../../shared/plan-suggest";

const log = createLogger("plan-suggest-bridge", "agent");

const dismissedSessions = new Set<string>();

type PendingConsent = {
  sessionId: string;
  tabId: string;
  resPath: string;
  reqPath: string;
  timer: ReturnType<typeof setTimeout>;
};

/** One pending consent per orchestrator session. */
const pendingBySession = new Map<string, PendingConsent>();

export function setPlanSuggestDismissed(sessionId: string, dismissed: boolean): void {
  const id = sessionId.trim();
  if (!id) return;
  if (dismissed) dismissedSessions.add(id);
  else dismissedSessions.delete(id);
}

interface PlanSuggestBridgeRequest {
  sessionId?: string;
  reason?: string;
}

function bridgeRoot(): string {
  return getPlanSuggestBridgeRoot();
}

function resolveOrchestratorSessionId(sessionId: string): string {
  const parent = AcpService.getInstance().getSessionParentId(sessionId);
  return parent?.trim() || sessionId;
}

function writeResult(resPath: string, reqPath: string, result: Record<string, unknown>): void {
  try {
    writeFileSync(resPath, JSON.stringify(result), "utf-8");
  } catch (err) {
    log.warn("plan-suggest write result failed", { error: String(err) });
  }
  try { unlinkSync(reqPath); } catch { /* ignore */ }
}

function finishPending(
  sessionId: string,
  decision: PlanSuggestDecision,
): boolean {
  const pending = pendingBySession.get(sessionId);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingBySession.delete(sessionId);

  if (decision === "dismissed" || decision === "timed_out") {
    dismissedSessions.add(sessionId);
  }

  if (decision === "accepted") {
    void AcpService.getInstance().applySessionAgent(sessionId, "plan").catch(() => {});
    // Same-turn continuation never sees chat:send's Plan appendix — put BINDING in the tool result.
    writeResult(pending.resPath, pending.reqPath, buildPlanSuggestAcceptedResult(sessionId));
  } else {
    writeResult(pending.resPath, pending.reqPath, {
      suggested: false,
      status: decision,
    });
  }

  emitChatStream(pending.tabId, "plan.suggest.resolve", {
    sessionId,
    decision,
  });
  return true;
}

/** Renderer / IPC: accept, dismiss, or let timeout fire. */
export function resolvePlanSuggestConsent(
  sessionIdRaw: string,
  decision: PlanSuggestDecision,
): { success: boolean; error?: string } {
  const sessionId = resolveOrchestratorSessionId(sessionIdRaw.trim());
  if (!sessionId) return { success: false, error: "missing_session_id" };
  if (!finishPending(sessionId, decision)) {
    // Heuristic-only consent (no tool pending) — still OK for renderer.
    if (decision === "dismissed" || decision === "timed_out") {
      dismissedSessions.add(sessionId);
    }
    if (decision === "accepted") {
      void AcpService.getInstance().applySessionAgent(sessionId, "plan").catch(() => {});
    }
    return { success: true };
  }
  return { success: true };
}

function beginConsent(args: {
  sessionId: string;
  tabId: string;
  reason: string;
  reqPath: string;
  resPath: string;
}): void {
  const prev = pendingBySession.get(args.sessionId);
  if (prev) {
    clearTimeout(prev.timer);
    writeResult(prev.resPath, prev.reqPath, {
      suggested: false,
      status: "ignored",
      error: "superseded",
    });
    pendingBySession.delete(args.sessionId);
  }

  const deadlineAt = Date.now() + PLAN_SUGGEST_TIMEOUT_MS;
  const timer = setTimeout(() => {
    finishPending(args.sessionId, "timed_out");
  }, PLAN_SUGGEST_TIMEOUT_MS);

  pendingBySession.set(args.sessionId, {
    sessionId: args.sessionId,
    tabId: args.tabId,
    resPath: args.resPath,
    reqPath: args.reqPath,
    timer,
  });

  emitChatStream(args.tabId, "plan.suggest", {
    reason: args.reason || null,
    sessionId: args.sessionId,
    deadlineAt,
    awaitsDecision: true,
  });
}

function acceptRequest(
  req: PlanSuggestBridgeRequest,
  reqPath: string,
  resPath: string,
): void {
  const rawSession = (req.sessionId ?? "").trim();
  if (!rawSession || rawSession === "unknown") {
    writeResult(resPath, reqPath, { suggested: false, status: "ignored", error: "missing_session" });
    return;
  }
  const sessionId = resolveOrchestratorSessionId(rawSession);
  const tabId = resolveChatTabId(sessionId);
  const sessionAgent = AcpService.getInstance().getSessionAgent(sessionId);
  const dismissed = dismissedSessions.has(sessionId);
  const gate = resolvePlanSuggestGate({ tabId, sessionAgent, dismissed });
  const reason = clampPlanSuggestReason(req.reason);

  if (gate !== "show" || !tabId) {
    writeResult(resPath, reqPath, {
      suggested: false,
      status: gate === "show" ? "ignored" : gate,
      reason: reason || undefined,
    });
    return;
  }

  // Do not write result yet — wait for accept / dismiss / timeout.
  beginConsent({ sessionId, tabId, reason, reqPath, resPath });
}

const processingRequests = new Set<string>();
let pollInFlight = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function processSessionDir(sessionDir: string): Promise<void> {
  if (!existsSync(sessionDir)) return;
  let entries: string[];
  try {
    entries = readdirSync(sessionDir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (!name.endsWith(".request.json")) continue;
    const reqPath = join(sessionDir, name);
    const requestId = name.replace(".request.json", "");
    const resPath = join(sessionDir, `${requestId}.result.json`);
    if (existsSync(resPath)) continue;
    if (processingRequests.has(reqPath)) continue;
    // Already awaiting user decision for this request file.
    if ([...pendingBySession.values()].some((p) => p.reqPath === reqPath)) continue;

    processingRequests.add(reqPath);
    try {
      const req = JSON.parse(readFileSync(reqPath, "utf-8")) as PlanSuggestBridgeRequest;
      acceptRequest(req, reqPath, resPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("plan-suggest bridge request failed", { session: basename(sessionDir), error: message });
      writeResult(resPath, reqPath, { suggested: false, status: "ignored", error: message });
    } finally {
      processingRequests.delete(reqPath);
    }
  }
}

async function pollOnce(): Promise<void> {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const root = bridgeRoot();
    if (!existsSync(root)) return;
    for (const name of readdirSync(root)) {
      await processSessionDir(join(root, name));
    }
  } finally {
    pollInFlight = false;
  }
}

export function startPlanSuggestBridge(): void {
  if (pollTimer) return;
  mkdirSync(bridgeRoot(), { recursive: true });
  pollTimer = setInterval(() => {
    void pollOnce();
  }, 80);
  log.info("Plan suggest bridge started");
}

export function stopPlanSuggestBridge(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  for (const [id, pending] of pendingBySession) {
    clearTimeout(pending.timer);
    writeResult(pending.resPath, pending.reqPath, {
      suggested: false,
      status: "ignored",
      error: "bridge_stopped",
    });
    pendingBySession.delete(id);
  }
}
