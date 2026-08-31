import { PI_PROVIDERS } from "../providers/pi-catalog";

/**
 * Official model hosts come from the Pi provider catalog (`PI_PROVIDERS`),
 * not a parallel Remote-only list. User `aiBaseUrls` are extra.
 */

const BLOCKED_HOSTS = new Set([
  "169.254.169.254",
  "metadata.google.internal",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);

export function hostnameOfUrl(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function piModelProxyHosts(): string[] {
  const hosts = new Set<string>();
  for (const provider of PI_PROVIDERS) {
    if (!provider.baseUrl) continue;
    const host = hostnameOfUrl(provider.baseUrl);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

export function isBlockedModelProxyHost(host: string): boolean {
  const name = host.trim().toLowerCase();
  if (!name) return true;
  if (BLOCKED_HOSTS.has(name)) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(name)) return true;
  return false;
}

function hostAllowed(host: string, extras: ReadonlyArray<string>): boolean {
  if (isBlockedModelProxyHost(host)) return false;
  for (const allowed of piModelProxyHosts()) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  for (const extra of extras) {
    const extraHost = hostnameOfUrl(extra);
    if (extraHost && (host === extraHost || host.endsWith(`.${extraHost}`))) return true;
  }
  return false;
}

export function isAllowedModelProxyUrl(
  url: string,
  extraBaseUrls: ReadonlyArray<string> = [],
): boolean {
  const host = hostnameOfUrl(url);
  if (!host) return false;
  return hostAllowed(host, extraBaseUrls);
}

/** Which Pi / settings provider owns this model URL. */
export function providerIdForModelProxyUrl(
  url: string,
  extraBaseUrls: Readonly<Record<string, string>> = {},
): string | null {
  for (const [providerId, base] of Object.entries(extraBaseUrls)) {
    if (!base?.trim()) continue;
    const extraHost = hostnameOfUrl(base);
    const host = hostnameOfUrl(url);
    if (extraHost && host && (host === extraHost || host.endsWith(`.${extraHost}`))) {
      return providerId;
    }
  }
  const host = hostnameOfUrl(url);
  if (!host) return null;
  for (const provider of PI_PROVIDERS) {
    if (!provider.baseUrl) continue;
    const allowed = hostnameOfUrl(provider.baseUrl);
    if (allowed && (host === allowed || host.endsWith(`.${allowed}`))) return provider.id;
  }
  return null;
}
