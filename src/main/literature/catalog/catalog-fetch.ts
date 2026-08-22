/** Pluggable fetch for catalog sources — main process installs mainNetFetch at startup. */
let catalogFetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);

export function setCatalogFetch(impl: typeof fetch): void {
  catalogFetchImpl = impl;
}

export function catalogFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return catalogFetchImpl(input, init);
}

/** @internal test helper */
export function resetCatalogFetchForTests(): void {
  catalogFetchImpl = (...args) => globalThis.fetch(...args);
}
