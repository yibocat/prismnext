/** Stable key for per-model thought-level preferences: `providerId/modelId`. */
export function modelPreferenceKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function parseModelPreferenceKey(key: string): { providerId: string; modelId: string } | null {
  const slash = key.indexOf("/");
  if (slash <= 0) return null;
  return {
    providerId: key.slice(0, slash),
    modelId: key.slice(slash + 1),
  };
}
