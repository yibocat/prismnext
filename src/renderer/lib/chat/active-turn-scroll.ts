/** Scroll helpers for Cursor-style active turn: user message pinned at viewport top. */

export function getTurnScrollTop(container: HTMLElement, turn: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const turnRect = turn.getBoundingClientRect();
  return container.scrollTop + (turnRect.top - containerRect.top);
}

/** User is following the live turn (not reading older turns above). */
export function isFollowingActiveTurn(container: HTMLElement): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
}

/** Pin the active turn so its user message sits at the viewport top. */
export function pinActiveTurnTop(
  container: HTMLElement,
  turn: HTMLElement,
  smooth = false,
): void {
  const turnTop = getTurnScrollTop(container, turn);
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const target = Math.min(turnTop, maxScroll);
  container.scrollTo({
    top: target,
    behavior: smooth ? "smooth" : "instant",
  });
}

/** Follow the bottom of a turn that overflows the viewport (streaming tail). */
export function followActiveTurnTail(
  container: HTMLElement,
  turn: HTMLElement,
  smooth = false,
): void {
  const turnTop = getTurnScrollTop(container, turn);
  const turnHeight = turn.offsetHeight;
  const viewH = container.clientHeight;
  if (turnHeight <= viewH) return;

  const target = turnTop + turnHeight - viewH;
  container.scrollTo({
    top: target,
    behavior: smooth ? "smooth" : "instant",
  });
}

/**
 * Scroll so the end of the turn is visible — used when streaming completes or
 * when the user taps "scroll to latest". Unlike pinActiveTurnTop, this keeps
 * the viewport at the reply tail, not the user message header.
 */
export function scrollToTurnEnd(
  container: HTMLElement,
  turn: HTMLElement,
  smooth = false,
): void {
  const turnTop = getTurnScrollTop(container, turn);
  const turnHeight = turn.offsetHeight;
  const viewH = container.clientHeight;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const target = Math.min(Math.max(0, turnTop + turnHeight - viewH), maxScroll);
  container.scrollTo({
    top: target,
    behavior: smooth ? "smooth" : "instant",
  });
}

/** Whether scroll position counts as following during an active stream. */
export function isFollowingStreamTurn(
  container: HTMLElement,
  turn: HTMLElement,
): boolean {
  const turnTop = getTurnScrollTop(container, turn);
  const turnHeight = turn.offsetHeight;
  const viewH = container.clientHeight;
  const tailScrollTop = turnTop + turnHeight - viewH;

  if (turnHeight <= viewH) {
    return container.scrollTop <= turnTop + 10;
  }
  return container.scrollTop >= tailScrollTop - 80;
}

/**
 * Scroll anchor for preserving the viewport when content is prepended to the
 * container (e.g. loading earlier messages). The topmost visible child is
 * captured as the sentinel; restoring re-pins the viewport to that same child
 * after the DOM has shifted.
 */
export interface SentinelsScrollAnchor {
  /** Distance from the sentinel's top to the container's viewport top at capture. */
  sentinelViewportOffset: number;
  /** The element to re-anchor to (null if the container had no children). */
  sentinel: Element | null;
  /** Fallback: scrollTop at capture, used if the sentinel is gone on restore. */
  scrollTop: number;
}

/** Capture the current scroll anchor so it can be restored after a prepend. */
export function captureSentinelScrollAnchor(container: HTMLElement): SentinelsScrollAnchor {
  const containerTop = container.getBoundingClientRect().top;
  const scrollTop = container.scrollTop;
  let sentinel: Element | null = null;
  for (const child of Array.from(container.children)) {
    // First child whose bottom is at or below the viewport top = topmost visible.
    if ((child as HTMLElement).getBoundingClientRect().bottom >= containerTop) {
      sentinel = child;
      break;
    }
  }
  const sentinelViewportOffset = sentinel
    ? (sentinel as HTMLElement).getBoundingClientRect().top - containerTop
    : 0;
  return { sentinelViewportOffset, sentinel, scrollTop };
}

/** Restore the viewport to the captured sentinel after the DOM has shifted. */
export function restoreSentinelScrollAnchor(
  container: HTMLElement,
  anchor: SentinelsScrollAnchor,
): void {
  if (!anchor) return;
  if (anchor.sentinel && container.contains(anchor.sentinel)) {
    const containerTop = container.getBoundingClientRect().top;
    const newOffset =
      (anchor.sentinel as HTMLElement).getBoundingClientRect().top - containerTop;
    container.scrollTop += newOffset - anchor.sentinelViewportOffset;
    return;
  }
  // Fallback: best-effort — keep the previous scrollTop.
  container.scrollTop = anchor.scrollTop;
}
