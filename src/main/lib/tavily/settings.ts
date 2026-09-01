function asKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

let hostOverride = "";

/** Host process: apply the Tavily key pushed from the laptop on connect. */
export function setHostTavilyApiKey(key: string | undefined): void {
  hostOverride = asKey(key);
}

/**
 * Desktop: Settings → Literature → Web search.
 * Remote Host: `setHostTavilyApiKey` after `host.configure`.
 */
export async function readTavilyApiKey(): Promise<string> {
  if (hostOverride) return hostOverride;
  try {
    const { getSettings } = await import("../../app/settings");
    return asKey(getSettings().tavilyApiKey);
  } catch {
    return "";
  }
}
