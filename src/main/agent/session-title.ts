import type {
  AgentGenerateSessionTitleInput,
  AgentGenerateSessionTitleResult,
} from "../../shared/agent/api";
import {
  buildSessionTitlePrompt,
  isProvisionalSessionTitle,
  sanitizeGeneratedSessionTitle,
} from "../../shared/agent/session-title";
import { createLogger } from "../app/logger";
import type { AgentSessionRecord } from "./session-store";
import { resolvePiModelFromRuntime } from "./pi-sdk-runtime";

const log = createLogger("session-title", "agent");

export interface SessionTitleCompleteInput {
  provider: string;
  model: string;
  apiKey: string;
  prompt: string;
}

export interface GenerateSessionTitleOpts {
  completeTitle?: (input: SessionTitleCompleteInput) => Promise<string>;
  auth?: {
    provider?: string;
    modelId?: string;
    apiKey?: string;
  };
}

/** Same Pi path as chat — not the simplified HTTP completer (custom / Zen / thinking models). */
export async function completeSessionTitleWithPi(
  input: SessionTitleCompleteInput,
): Promise<string> {
  const { completeSimple, contentText } = await import("@earendil-works/pi-ai/compat");
  const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const { InMemoryCredentialStore } = await import("@earendil-works/pi-ai");

  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: true,
  });
  await runtime.setRuntimeApiKey(input.provider, input.apiKey);
  const model = await resolvePiModelFromRuntime(runtime, {
    providerId: input.provider,
    modelId: input.model,
    apiKey: input.apiKey,
  });
  const message = await completeSimple(model, {
    messages: [{
      role: "user",
      content: input.prompt,
      timestamp: Date.now(),
    }],
  }, {
    apiKey: input.apiKey,
    maxTokens: 128,
    temperature: 0.2,
    reasoning: "minimal",
    timeoutMs: 15_000,
  });
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new Error(message.errorMessage || message.stopReason);
  }
  const text = contentText(message.content).trim();
  if (!text) throw new Error("Empty chat completion response");
  return text;
}

export async function generateSessionTitleFromRecord(
  record: AgentSessionRecord,
  input: AgentGenerateSessionTitleInput,
  settings: Record<string, unknown>,
  opts?: GenerateSessionTitleOpts,
): Promise<AgentGenerateSessionTitleResult> {
  const first = record.turns.find((turn) => turn.status === "completed");
  const userText = (input.userText || first?.user.text || "").trim();
  const assistantText = (input.assistantText || first?.assistant.text || "").trim();
  if (!userText) return { ok: false, error: "missing_excerpt" };

  if (!isProvisionalSessionTitle(record.title, userText)) {
    return { ok: true, title: record.title, skipped: true };
  }

  const keys = settings.aiApiKeys as Record<string, string> | undefined;
  const provider = (
    opts?.auth?.provider
    || record.modelRef?.provider
    || (typeof settings.aiProvider === "string" ? settings.aiProvider : "")
  ).trim();
  const model = (
    opts?.auth?.modelId
    || record.modelRef?.modelId
    || (typeof settings.aiModel === "string" ? settings.aiModel : "")
  ).trim();
  const apiKey = (opts?.auth?.apiKey || keys?.[provider] || "").trim();
  if (!provider || !model || !apiKey) {
    return { ok: false, error: !provider ? "missing_pi_provider" : !model ? "missing_pi_model" : "missing_pi_api_key" };
  }

  try {
    const complete = opts?.completeTitle ?? completeSessionTitleWithPi;
    const raw = await complete({
      provider,
      model,
      apiKey,
      prompt: buildSessionTitlePrompt(userText, assistantText),
    });
    const title = sanitizeGeneratedSessionTitle(raw);
    if (!title) return { ok: false, error: "empty_title" };
    log.info("generateSessionTitle ok", { conversationId: record.conversationId, title });
    return { ok: true, title };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn("generateSessionTitle failed", { conversationId: record.conversationId, error });
    return { ok: false, error };
  }
}
