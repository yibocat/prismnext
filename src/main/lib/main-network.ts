/**
 * Main-process outbound HTTP — single network route for prismnext.
 *
 * ## Two stacks in Electron main
 *
 * | Stack | API | Proxy / TLS |
 * |-------|-----|-------------|
 * | Node (default) | `globalThis.fetch` | Node/undici — often **ignores macOS/Windows system proxy** |
 * | Chromium (prismnext) | `electron.net.fetch` via {@link mainNetFetch} | Same as in-app browser — **follows system proxy/VPN** |
 *
 * Use {@link mainNetFetch} (or injected {@link catalogFetch} in literature catalog sources)
 * for all user-facing catalog / citation APIs in main. Do **not** rely on bare Node fetch
 * for Crossref, arXiv, OpenAlex, Semantic Scholar, etc.
 *
 * Call {@link setCatalogFetch}(`mainNetFetch`) once at app startup (before literature bridge).
 */
import { net } from "electron";

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "PrismNext/1.0 (mailto:yibocat@yeah.net)",
} as const;

const DEFAULT_TIMEOUT_MS = 20_000;

/** Chromium network stack — canonical main-process fetch. */
export async function mainNetFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  try {
    return await net.fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

