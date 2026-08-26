import {
  GATEWAY_PLACEHOLDER_KEY,
  isAllowedModelProxyUrl,
  isModelProxyStart,
  providerIdForModelProxyUrl,
  stripProxyHeaders,
  type ModelProxyPush,
  type ModelProxyStart,
} from "../../shared/remote";

type GatewaySettings = {
  aiApiKeys?: Record<string, string>;
  aiBaseUrls?: Record<string, string>;
};

async function desktopSettings(): Promise<GatewaySettings> {
  // Lazy: settings.ts constructs electron-store. Tests that never run the
  // Gateway must not load it just because this module is imported.
  const { getSettings } = await import("../app/settings");
  return getSettings() as GatewaySettings;
}

function extraBaseUrls(settings: GatewaySettings): string[] {
  return Object.values(settings.aiBaseUrls ?? {}).filter(Boolean);
}

function resolveApiKeyForUrl(url: string, settings: GatewaySettings): string | null {
  const keys = settings.aiApiKeys ?? {};
  const providerId = providerIdForModelProxyUrl(url, settings.aiBaseUrls ?? {});
  if (providerId) {
    const keyed = keys[providerId]?.trim();
    if (keyed && keyed !== GATEWAY_PLACEHOLDER_KEY) return keyed;
  }
  return null;
}

function usesApiKeyHeader(providerId: string | null): boolean {
  return providerId === "anthropic" || providerId === "minimax" || providerId === "minimax-cn";
}

function applyKey(url: string, headers: Record<string, string>, apiKey: string, extraBaseUrls: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  const providerId = providerIdForModelProxyUrl(url, extraBaseUrls);
  if (usesApiKeyHeader(providerId)) {
    next["x-api-key"] = apiKey;
  } else {
    next.Authorization = `Bearer ${apiKey}`;
  }
  return next;
}

export async function runModelProxyStart(
  start: ModelProxyStart,
  push: (chunk: ModelProxyPush) => Promise<void>,
): Promise<void> {
  const settings = await desktopSettings();
  if (!isAllowedModelProxyUrl(start.url, extraBaseUrls(settings))) {
    await push({
      requestId: start.requestId,
      kind: "error",
      error: "model_host_not_allowed",
    });
    return;
  }
  const apiKey = resolveApiKeyForUrl(start.url, settings);
  if (!apiKey) {
    await push({
      requestId: start.requestId,
      kind: "error",
      error: "missing_local_key",
    });
    return;
  }
  const headers = applyKey(start.url, stripProxyHeaders(start.headers), apiKey, settings.aiBaseUrls ?? {});
  try {
    const response = await fetch(start.url, {
      method: start.method || "POST",
      headers,
      body: start.body,
    });
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    await push({
      requestId: start.requestId,
      kind: "head",
      status: response.status,
      headers: stripProxyHeaders(responseHeaders),
    });
    if (!response.body) {
      const text = await response.text();
      if (text) await push({ requestId: start.requestId, kind: "body", text });
      await push({ requestId: start.requestId, kind: "end" });
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) await push({ requestId: start.requestId, kind: "body", text });
    }
    await push({ requestId: start.requestId, kind: "end" });
  } catch (err) {
    await push({
      requestId: start.requestId,
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function parseModelProxyStart(payload: unknown): ModelProxyStart | null {
  return isModelProxyStart(payload) ? payload : null;
}
