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
 * Use {@link mainNetFetch} (or injected {@link catalogFetch} in shared bibliographic sources)
 * for all user-facing catalog / citation APIs in main. Do **not** rely on bare Node fetch
 * for Crossref, arXiv, OpenAlex, Semantic Scholar, etc.
 *
 * Call {@link installMainProcessNetwork} once at app startup (before literature bridge).
 */
import { net } from "electron";
import { setCatalogFetch } from "../../shared/bibliographic-metadata/catalog-fetch";

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "PrismNext/1.0 (mailto:support@researchprism.app)",
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

/** Wire shared bibliographic catalog sources to {@link mainNetFetch}. Idempotent. */
export function installMainProcessNetwork(): void {
  setCatalogFetch(mainNetFetch as typeof fetch);
}

/** @deprecated Use {@link mainNetFetch} — kept for incremental migration. */
export const chromiumFetch = mainNetFetch;
