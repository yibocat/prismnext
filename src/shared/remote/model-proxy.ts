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
