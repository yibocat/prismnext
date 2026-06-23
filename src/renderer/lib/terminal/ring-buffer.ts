const DEFAULT_CAP_BYTES = 512 * 1024;

/** Append text and truncate from the front when exceeding cap (UTF-16 code units). */
export function appendRingBuffer(
  prev: string,
  chunk: string,
  cap = DEFAULT_CAP_BYTES,
): string {
  if (!chunk) return prev;
  const next = prev + chunk;
  if (next.length <= cap) return next;
  return next.slice(next.length - cap);
}

export { DEFAULT_CAP_BYTES };
