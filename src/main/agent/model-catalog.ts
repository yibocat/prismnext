/**
 * Pi-backed model catalog for Settings.
 * Lists models from ModelRuntime and probes keys over HTTP.
 * Does not import acp/ or read the OpenCode cache.
 */

import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { migrateProviderIdToPi } from "../../shared/providers/pi-catalog";
import type {
  AgentEffortCatalogSnapshot,
  AgentListModelsInput,
  AgentListModelsResult,
  AgentModelEffortInput,
  AgentModelEffortResult,
  AgentModelRow,
  AgentModelsCatalogSnapshot,
  AgentTestConnectionInput,
  AgentTestConnectionResult,
} from "../../shared/agent/api";

export interface AgentPiModelCostLike {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface AgentPiModelLike {
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  thinkingLevelMap?: Partial<Record<string, string | null>>;
  input: readonly string[];
  contextWindow: number;
  maxTokens?: number;
  cost?: AgentPiModelCostLike;
}

export interface AgentModelRuntimeLike {
  setRuntimeApiKey(providerId: string, apiKey: string): Promise<void>;
  removeRuntimeApiKey(providerId: string): Promise<void>;
  getModels(providerId?: string): readonly AgentPiModelLike[];
  getModel(providerId: string, modelId: string): AgentPiModelLike | undefined;
  refresh?(options: {
    providers?: readonly string[];
    allowNetwork?: boolean;
    force?: boolean;
  }): Promise<{ errors: ReadonlyMap<string, Error> }>;
}

export interface AgentModelCatalogDeps {
  createRuntime?: () => Promise<AgentModelRuntimeLike>;
  fetchImpl?: typeof fetch;
}

const CATALOG_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "zai",
  "zai-coding-cn",
  "moonshotai",
  "moonshotai-cn",
  "minimax",
  "minimax-cn",
  "kimi-coding",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "mistral",
  "groq",
  "xai",
  "nvidia",
  "cerebras",
  "together",
  "baseten",
  "fireworks",
  "opencode",
  "opencode-go",
] as const;

const PROVIDER_ENDPOINTS: Record<string, { url: string; header: string; prefix: string }> = {
  anthropic: {
    url: "https://api.anthropic.com",
    header: "x-api-key",
    prefix: "",
  },
  openai: {
    url: "https://api.openai.com",
    header: "Authorization",
    prefix: "Bearer ",
  },
  google: {
    url: "https://generativelanguage.googleapis.com",
    header: "",
    prefix: "",
  },
  deepseek: {
    url: "https://api.deepseek.com",
    header: "Authorization",
    prefix: "Bearer ",
  },
  openrouter: {
    url: "https://openrouter.ai/api",
    header: "Authorization",
    prefix: "Bearer ",
  },
  groq: {
    url: "https://api.groq.com/openai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  mistral: {
    url: "https://api.mistral.ai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  xai: {
    url: "https://api.x.ai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  nvidia: {
    url: "https://integrate.api.nvidia.com",
    header: "Authorization",
    prefix: "Bearer ",
  },
  cerebras: {
    url: "https://api.cerebras.ai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  together: {
    url: "https://api.together.ai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  baseten: {
    url: "https://inference.baseten.co",
    header: "Authorization",
    prefix: "Bearer ",
  },
  fireworks: {
    url: "https://api.fireworks.ai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  zai: {
    url: "https://api.z.ai/api/coding/paas/v4",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "zai-coding-cn": {
    url: "https://open.bigmodel.cn/api/coding/paas/v4",
    header: "Authorization",
    prefix: "Bearer ",
  },
  moonshotai: {
    url: "https://api.moonshot.ai",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "moonshotai-cn": {
    url: "https://api.moonshot.cn",
    header: "Authorization",
    prefix: "Bearer ",
  },
  minimax: {
    url: "https://api.minimax.io",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "minimax-cn": {
    url: "https://api.minimaxi.com",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "kimi-coding": {
    url: "https://api.kimi.com/coding",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "qwen-token-plan": {
    url: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "qwen-token-plan-cn": {
    url: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode",
    header: "Authorization",
    prefix: "Bearer ",
  },
  opencode: {
    url: "https://opencode.ai/zen/v1",
    header: "Authorization",
    prefix: "Bearer ",
  },
  "opencode-go": {
    url: "https://opencode.ai/zen/go/v1",
    header: "Authorization",
    prefix: "Bearer ",
  },
};

let cachedRuntime: AgentModelRuntimeLike | null = null;

export function mapProductProviderToPi(providerId: string): string | null {
  const id = migrateProviderIdToPi(providerId);
  if (!id || id === "custom" || id.startsWith("custom-")) return null;
  return id;
}

export function mapPiProviderToProduct(piProviderId: string): string {
  return piProviderId;
}

export function formatAgentContextWindow(tokens: number | undefined): string {
  if (!tokens || tokens <= 0) return "Unknown";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function resolveModelsListUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return "/v1/models";
  if (/\/v\d+$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

export function validateApiKey(apiKey: string): { ok: true; key: string } | { ok: false; reason: "empty" | "non_ascii" } {
  const key = apiKey.trim();
  if (!key) return { ok: false, reason: "empty" };
  if (/[^\u0000-\u00ff]/.test(key)) return { ok: false, reason: "non_ascii" };
  return { ok: true, key };
}

/** Product effort levels a reasoning model exposes (Pi thinkingLevelMap keys, minus off). */
const PRODUCT_EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;

export function effortsFromPiModel(model: AgentPiModelLike): string[] {
  if (!model.reasoning) return [];
  const map = model.thinkingLevelMap;
  if (!map) return ["low", "medium", "high"];
  const out: string[] = [];
  for (const level of PRODUCT_EFFORT_LEVELS) {
    if (!(level in map)) continue;
    if (map[level] === null) continue;
    out.push(level);
  }
  return out;
}

export function toAgentModelRow(model: AgentPiModelLike): AgentModelRow {
  const efforts = effortsFromPiModel(model);
  const cost = model.cost;
  return {
    id: model.id,
    name: model.name || model.id,
    contextWindow: formatAgentContextWindow(model.contextWindow),
    capabilities: model.input.includes("image") ? { vision: true } : undefined,
    efforts: efforts.length > 0 ? efforts : undefined,
    ...(typeof model.maxTokens === "number" && model.maxTokens > 0
      ? { maxTokens: formatAgentContextWindow(model.maxTokens), maxTokensNum: model.maxTokens }
      : {}),
    ...(cost && (cost.input != null || cost.output != null)
      ? { cost: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite } }
      : {}),
  };
}

async function defaultCreateRuntime(): Promise<AgentModelRuntimeLike> {
  if (cachedRuntime) return cachedRuntime;
  cachedRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: true,
  });
  return cachedRuntime;
}

function fetchFn(deps?: AgentModelCatalogDeps): typeof fetch {
  return deps?.fetchImpl ?? fetch;
}

function createRuntime(deps?: AgentModelCatalogDeps): Promise<AgentModelRuntimeLike> {
  return (deps?.createRuntime ?? defaultCreateRuntime)();
}

function parseModelIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const id = (item as { id?: unknown }).id;
        return typeof id === "string" ? id : "";
      })
      .filter(Boolean);
  }
  if (Array.isArray(record.models)) {
    return record.models
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as { id?: unknown; name?: unknown };
        if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
        if (typeof row.name === "string") return row.name.replace(/^models\//, "");
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

function parseModelRows(body: unknown): AgentModelRow[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const list = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  const rows: AgentModelRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      id?: unknown;
      name?: unknown;
      context_length?: unknown;
      contextWindow?: unknown;
    };
    const id = typeof row.id === "string"
      ? row.id.trim()
      : typeof row.name === "string"
        ? row.name.replace(/^models\//, "").trim()
        : "";
    if (!id) continue;
    const tokens = typeof row.context_length === "number"
      ? row.context_length
      : typeof row.contextWindow === "number"
        ? row.contextWindow
        : undefined;
    rows.push({
      id,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : id,
      contextWindow: formatAgentContextWindow(tokens),
    });
  }
  return rows;
}

async function probeProviderHttp(
  input: { provider: string; apiKey: string; baseUrl?: string },
  deps?: AgentModelCatalogDeps,
): Promise<{ ok: boolean; models?: string[]; body?: unknown }> {
  const keyCheck = validateApiKey(input.apiKey);
  if (!keyCheck.ok) return { ok: false };
  const key = keyCheck.key;
  const provider = input.provider.trim();
  const ep = PROVIDER_ENDPOINTS[provider];
  const baseUrl = input.baseUrl?.trim() || ep?.url;
  if (!baseUrl) return { ok: false };

  try {
    if (provider === "google") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
      const res = await fetchFn(deps)(url);
      const body = await res.json() as unknown;
      return { ok: res.ok, models: parseModelIds(body), body };
    }

    const listUrl = resolveModelsListUrl(baseUrl);
    const headers: Record<string, string> = {};
    if (ep?.header) {
      headers[ep.header] = `${ep.prefix}${key}`;
    } else {
      headers.Authorization = `Bearer ${key}`;
    }
    if (
      provider === "opencode-go"
      || provider === "opencode"
    ) {
      headers["x-api-key"] = key;
    }

    const res = await fetchFn(deps)(listUrl, { headers });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("json")) return { ok: false };
    const body = await res.json() as unknown;
    return { ok: res.ok, models: parseModelIds(body), body };
  } catch {
    return { ok: false };
  }
}

export async function listAgentModels(
  input: AgentListModelsInput,
  deps?: AgentModelCatalogDeps,
): Promise<AgentListModelsResult> {
  const providerId = input.providerId.trim();
  const piId = mapProductProviderToPi(providerId);
  const key = input.apiKey?.trim();

  if (piId) {
    const runtime = await createRuntime(deps);
    let models: AgentModelRow[] = [];
    if (key && validateApiKey(key).ok) {
      await runtime.setRuntimeApiKey(piId, key);
      try {
        await runtime.refresh?.({
          providers: [piId],
          allowNetwork: true,
          force: true,
        });
        models = runtime.getModels(piId).map(toAgentModelRow);
      } finally {
        await runtime.removeRuntimeApiKey(piId);
      }
    } else {
      models = runtime.getModels(piId).map(toAgentModelRow);
    }
    if (models.length > 0) return { models, source: "pi" };
  }

  if (key || input.baseUrl?.trim()) {
    const probed = await probeProviderHttp(
      { provider: providerId, apiKey: key ?? "", baseUrl: input.baseUrl },
      deps,
    );
    if (probed.ok) {
      const rows = parseModelRows(probed.body);
      if (rows.length > 0) return { models: rows, source: "api" };
      if (probed.models?.length) {
        return {
          models: probed.models.map((id) => ({
            id,
            name: id,
            contextWindow: "Unknown",
          })),
          source: "api",
        };
      }
    }
  }

  return { models: [], source: piId ? "pi" : "api" };
}

export async function listAgentModelsCatalog(
  deps?: AgentModelCatalogDeps,
): Promise<AgentModelsCatalogSnapshot> {
  const entries: Record<string, AgentModelRow[]> = {};
  for (const providerId of CATALOG_PROVIDER_IDS) {
    const result = await listAgentModels({ providerId }, deps);
    entries[providerId] = result.models;
  }
  return { entries, fetchedAt: Date.now() };
}

export async function testAgentConnection(
  input: AgentTestConnectionInput,
  deps?: AgentModelCatalogDeps,
): Promise<AgentTestConnectionResult> {
  const keyCheck = validateApiKey(input.apiKey);
  if (!keyCheck.ok) return { success: false };
  const probed = await probeProviderHttp(
    { provider: input.provider, apiKey: keyCheck.key, baseUrl: input.baseUrl },
    deps,
  );
  if (!probed.ok) return { success: false };
  return { success: true, models: probed.models };
}

export async function getAgentModelEffort(
  input: AgentModelEffortInput,
  deps?: AgentModelCatalogDeps,
): Promise<AgentModelEffortResult> {
  const fallback = input.fallback?.filter(Boolean) ?? [];
  const piId = mapProductProviderToPi(input.provider);
  if (piId) {
    const runtime = await createRuntime(deps);
    const model = runtime.getModel(piId, input.modelId.trim())
      ?? runtime.getModels(piId).find((item) => item.id === input.modelId.trim());
    if (model) {
      const efforts = effortsFromPiModel(model);
      if (efforts.length > 0) return { efforts, source: "pi" };
    }
  }
  if (fallback.length > 0) return { efforts: fallback, source: "fallback" };
  return { efforts: [], source: "none" };
}

export async function getAgentEffortCatalog(
  deps?: AgentModelCatalogDeps,
): Promise<AgentEffortCatalogSnapshot> {
  const runtime = await createRuntime(deps);
  const entries: Record<string, string[]> = {};
  for (const model of runtime.getModels()) {
    const efforts = effortsFromPiModel(model);
    if (efforts.length === 0) continue;
    const provider = mapPiProviderToProduct(model.provider);
    entries[`${provider}/${model.id}`] = efforts;
  }
  return { entries, fetchedAt: Date.now() };
}
