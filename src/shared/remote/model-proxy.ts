/** Placeholder Pi credential on Host. Desktop Gateway replaces it. Never a real key. */
export const GATEWAY_PLACEHOLDER_KEY = "prismnext-gateway";

export const MODEL_PROXY_START_CHANNEL = "model.proxy.start";

export interface ModelProxyStart {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type ModelProxyPushKind = "head" | "body" | "end" | "error";

export interface ModelProxyPush {
  requestId: string;
  kind: ModelProxyPushKind;
  status?: number;
  headers?: Record<string, string>;
  text?: string;
  error?: string;
}

const SECRET_HEADER = /^(authorization|x-api-key|api-key)$/i;

/** Drop empty / placeholder keys before they are written or sent to Host. */
export type RemoteModelKeysMode = "gateway" | "remote";

export interface HostModelConfigureResult {
  ok: true;
  modelKeys: RemoteModelKeysMode;
  providerIds: string[];
  wrapOk: boolean;
  persisted: boolean;
}

export interface DesktopModelSeedSummary {
  providerIds: string[];
  wrapOk: boolean;
  error?: string;
}

/** Laptop Settings keys prepared for Host `host.configure`. Never log the maps. */
export interface DesktopModelSeed extends DesktopModelSeedSummary {
  aiApiKeys: Record<string, string>;
  aiBaseUrls: Record<string, string>;
  extraBaseUrls: string[];
  wrapKey: string;
  /** Laptop Tavily key for Host websearch/webfetch. Empty when unset. */
  tavilyApiKey?: string;
}

export function emptyDesktopModelSeed(error: string): DesktopModelSeed {
  return {
    aiApiKeys: {},
    aiBaseUrls: {},
    extraBaseUrls: [],
    wrapKey: "",
    providerIds: [],
    wrapOk: false,
    tavilyApiKey: "",
    error,
  };
}

export function hostModelProviderIds(value: unknown): string[] {
  return Object.keys(sanitizeHostModelKeyMap(value)).sort();
}

export function isHostModelConfigureResult(value: unknown): value is HostModelConfigureResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return rec.ok === true
    && (rec.modelKeys === "remote" || rec.modelKeys === "gateway")
    && Array.isArray(rec.providerIds)
    && rec.providerIds.every((id) => typeof id === "string")
    && typeof rec.wrapOk === "boolean"
    && typeof rec.persisted === "boolean";
}

/** Chat on Host: do not reuse the local “add a key in Settings” code. */
export function remapHostMissingApiKey(
  error: string,
  provider: string,
  hostProviderIds: readonly string[],
): string {
  if (error !== "missing_pi_api_key") return error;
  if (hostProviderIds.length === 0) return "host_model_unconfigured";
  const id = provider.trim() || "unknown";
  return `missing_host_api_key:${id}`;
}

export function describeModelSeedGate(input: {
  mode: RemoteModelKeysMode;
  seed: DesktopModelSeedSummary;
  hostProviderIds?: readonly string[];
}): { ok: boolean; detail: string } {
  if (input.mode === "gateway") {
    return { ok: true, detail: "Gateway mode — API keys stay on this computer." };
  }
  if (input.seed.error) {
    return { ok: false, detail: `Could not read Settings API keys (${input.seed.error}).` };
  }
  if (input.seed.providerIds.length === 0) {
    return { ok: false, detail: "Settings → Models has no API keys to send to the Host." };
  }
  const ids = input.hostProviderIds?.length
    ? [...input.hostProviderIds]
    : [...input.seed.providerIds];
  return { ok: true, detail: `Host has API keys for ${ids.join(", ")}.` };
}

export function sanitizeHostModelKeyMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, key] of Object.entries(value as Record<string, unknown>)) {
    const provider = id.trim();
    if (!provider || typeof key !== "string") continue;
    const trimmed = key.trim();
    if (!trimmed || trimmed === GATEWAY_PLACEHOLDER_KEY) continue;
    out[provider] = trimmed;
  }
  return out;
}

export function stripProxyHeaders(headers: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SECRET_HEADER.test(key)) continue;
    next[key] = value;
  }
  return next;
}

export function isModelProxyStart(value: unknown): value is ModelProxyStart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.requestId === "string"
    && typeof rec.url === "string"
    && typeof rec.method === "string"
    && Boolean(rec.headers && typeof rec.headers === "object" && !Array.isArray(rec.headers));
}

export function isModelProxyPush(value: unknown): value is ModelProxyPush {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.requestId === "string"
    && (rec.kind === "head" || rec.kind === "body" || rec.kind === "end" || rec.kind === "error");
}
