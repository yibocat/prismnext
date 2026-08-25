import type {
  AgentGenerateSessionTitleInput,
  AgentGenerateSessionTitleResult,
} from "../../shared/agent/api";
import {
  buildSessionTitlePrompt,
  isProvisionalSessionTitle,
  sanitizeGeneratedSessionTitle,
} from "../../shared/agent/session-title";
import { completeChatText } from "../lib/provider-chat";
import { createLogger } from "../app/logger";
import type { AgentSessionRecord } from "./session-store";

const log = createLogger("session-title", "agent");

export async function generateSessionTitleFromRecord(
  record: AgentSessionRecord,
  input: AgentGenerateSessionTitleInput,
  settings: Record<string, unknown>,
): Promise<AgentGenerateSessionTitleResult> {
  const first = record.turns.find((turn) => turn.status === "completed");
  const userText = (input.userText || first?.user.text || "").trim();
  const assistantText = (input.assistantText || first?.assistant.text || "").trim();
  if (!userText) return { ok: false, error: "missing_excerpt" };

  if (!isProvisionalSessionTitle(record.title, userText)) {
    return { ok: true, title: record.title, skipped: true };
  }

  const keys = settings.aiApiKeys as Record<string, string> | undefined;
  const baseUrls = settings.aiBaseUrls as Record<string, string> | undefined;
  const provider = (
    record.modelRef?.provider
    || (typeof settings.aiProvider === "string" ? settings.aiProvider : "")
  ).trim();
  const model = (
    record.modelRef?.modelId
    || (typeof settings.aiModel === "string" ? settings.aiModel : "")
  ).trim();
  const apiKey = (keys?.[provider] ?? "").trim();
  if (!provider || !model || !apiKey) {
    return { ok: false, error: !provider ? "missing_pi_provider" : !model ? "missing_pi_model" : "missing_pi_api_key" };
  }

  try {
    const raw = await completeChatText({
      provider,
      model,
      apiKey,
      baseUrl: baseUrls?.[provider],
      prompt: buildSessionTitlePrompt(userText, assistantText),
      maxTokens: 48,
      timeoutMs: 15_000,
    });
    const title = sanitizeGeneratedSessionTitle(raw);
    if (!title) return { ok: false, error: "empty_title" };
    return { ok: true, title };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn("generateSessionTitle failed", { conversationId: record.conversationId, error });
    return { ok: false, error };
  }
}
