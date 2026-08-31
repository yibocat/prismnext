import { randomUUID } from "node:crypto";
import {
  isAllowedModelProxyUrl,
  isModelProxyPush,
  stripProxyHeaders,
  type ModelProxyPush,
  type ModelProxyStart,
} from "../shared/remote";
import { MODEL_PROXY_START_CHANNEL } from "../shared/remote";

type Pending = {
  head?: { status: number; headers: Record<string, string> };
  chunks: string[];
  done: boolean;
  error?: string;
  waiters: Array<() => void>;
};

const pending = new Map<string, Pending>();
let proxyEnabled = false;
let extraBaseUrls: string[] = [];

export function setHostModelProxyEnabled(enabled: boolean): void {
  proxyEnabled = enabled;
}

export function setHostModelProxyExtraBaseUrls(urls: readonly string[]): void {
  extraBaseUrls = [...urls];
}

function wake(entry: Pending): void {
  const waiters = entry.waiters.splice(0);
  for (const waiter of waiters) waiter();
}

export function acceptModelProxyPush(params: unknown): { ok: boolean } {
  if (!isModelProxyPush(params)) return { ok: false };
  const entry = pending.get(params.requestId);
  if (!entry) return { ok: false };
  if (params.kind === "head") {
    entry.head = {
      status: params.status ?? 502,
      headers: params.headers ?? {},
    };
  } else if (params.kind === "body" && params.text) {
    entry.chunks.push(params.text);
  } else if (params.kind === "end") {
    entry.done = true;
  } else if (params.kind === "error") {
    entry.error = params.error || "model_proxy_error";
    entry.done = true;
  }
  wake(entry);
  return { ok: true };
}

function wait(entry: Pending): Promise<void> {
  if (entry.done || entry.chunks.length > 0 || entry.head) return Promise.resolve();
  return new Promise((resolve) => {
    entry.waiters.push(resolve);
  });
}

export function installHostModelProxyFetch(
  emit: (channel: string, payload: unknown) => void,
): () => void {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (!proxyEnabled || !isAllowedModelProxyUrl(url, extraBaseUrls)) {
      return original(input, init);
    }
    const requestId = randomUUID();
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
      if (rawHeaders instanceof Headers) {
        rawHeaders.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        for (const [key, value] of Object.entries(rawHeaders)) {
          if (typeof value === "string") headers[key] = value;
        }
      }
    }
    const body = typeof init?.body === "string" ? init.body : undefined;
    const start: ModelProxyStart = {
      requestId,
      url,
      method: String(init?.method ?? "POST"),
      headers: stripProxyHeaders(headers),
      body,
    };
    const entry: Pending = { chunks: [], done: false, waiters: [] };
    pending.set(requestId, entry);
    emit(MODEL_PROXY_START_CHANNEL, start);

    while (!entry.head && !entry.done) await wait(entry);
    if (entry.error) {
      pending.delete(requestId);
      throw new Error(entry.error);
    }
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (!entry.chunks.length && !entry.done) await wait(entry);
        const text = entry.chunks.shift();
        if (text) {
          controller.enqueue(new TextEncoder().encode(text));
          return;
        }
        if (entry.error) {
          controller.error(new Error(entry.error));
          pending.delete(requestId);
          return;
        }
        if (entry.done) {
          controller.close();
          pending.delete(requestId);
        }
      },
    });
    return new Response(stream, {
      status: entry.head?.status ?? 200,
      headers: entry.head?.headers,
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
    pending.clear();
  };
}
