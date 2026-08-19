/** Scroll helpers for the live turn: follow the reply tail; rail jumps still pin a turn to the top. */

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

/** Pin the user message to the top while the turn still fits; follow the tail once it overflows. */
export function pinOrFollowActiveTurn(
  container: HTMLElement,
  turn: HTMLElement,
  smooth = false,
): void {
  if (turn.offsetHeight <= container.clientHeight) {
    pinActiveTurnTop(container, turn, smooth);
    return;
  }
  followActiveTurnTail(container, turn, smooth);
}

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

  // Current turn is pinned to the top (new-send / short reply).
  if (Math.abs(container.scrollTop - turnTop) <= 80) return true;

  if (turnHeight <= viewH) {
    return container.scrollHeight - container.scrollTop - viewH < 80;
  }
  const tailScrollTop = turnTop + turnHeight - viewH;
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
  /** Absolute turn index on the sentinel section (`data-chat-turn-index`), if any. */
  turnIndex: number | null;
  /** Fallback: scrollTop at capture, used if the sentinel is gone on restore. */
  scrollTop: number;
}

function resolveSentinelElement(
  scrollContainer: HTMLElement,
  contentRoot: HTMLElement,
  anchor: SentinelsScrollAnchor,
): HTMLElement | null {
  if (anchor.sentinel instanceof HTMLElement && scrollContainer.contains(anchor.sentinel)) {
    return anchor.sentinel;
  }
  if (anchor.turnIndex != null) {
    const byIndex = contentRoot.querySelector(
      `[data-chat-turn-index="${anchor.turnIndex}"]`,
    );
    if (byIndex instanceof HTMLElement) return byIndex;
  }
  return null;
}

/**
 * Capture the current scroll anchor so it can be restored after a prepend.
 * Walks `contentRoot` children (default: scroll container) but adjusts
 * `scrollContainer.scrollTop` on restore.
 */
export function captureSentinelScrollAnchor(
  scrollContainer: HTMLElement,
  contentRoot: HTMLElement = scrollContainer,
): SentinelsScrollAnchor {
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const scrollTop = scrollContainer.scrollTop;
  let sentinel: Element | null = null;
  for (const child of Array.from(contentRoot.children)) {
    const el = child as HTMLElement;
    // Prefer stable turn sections over windowing chrome.
    if (el.hasAttribute("data-chat-turn-window-sentinel")) continue;
    if (el.hasAttribute("data-chat-turn-window-spacer")) continue;
    if (el.hasAttribute("data-chat-turn-window-load-more")) continue;
    if (el.hasAttribute("data-chat-turn-runway")) continue;
    // First child whose bottom is at or below the viewport top = topmost visible.
    if (el.getBoundingClientRect().bottom >= containerTop) {
      sentinel = child;
      break;
    }
  }
  const sentinelEl = sentinel as HTMLElement | null;
  const turnAttr = sentinelEl?.getAttribute("data-chat-turn-index");
  const turnIndex =
    turnAttr != null && turnAttr !== "" && Number.isFinite(Number(turnAttr))
      ? Number(turnAttr)
      : null;
  const sentinelViewportOffset = sentinelEl
    ? sentinelEl.getBoundingClientRect().top - containerTop
    : 0;
  return { sentinelViewportOffset, sentinel, turnIndex, scrollTop };
}

/** Restore the viewport to the captured sentinel after the DOM has shifted. */
export function restoreSentinelScrollAnchor(
  scrollContainer: HTMLElement,
  anchor: SentinelsScrollAnchor,
  contentRoot: HTMLElement = scrollContainer,
): void {
  if (!anchor) return;
  const el = resolveSentinelElement(scrollContainer, contentRoot, anchor);
  if (el) {
    const containerTop = scrollContainer.getBoundingClientRect().top;
    const newOffset = el.getBoundingClientRect().top - containerTop;
    scrollContainer.scrollTop += newOffset - anchor.sentinelViewportOffset;
    return;
  }
  // Fallback: best-effort — keep the previous scrollTop.
  scrollContainer.scrollTop = anchor.scrollTop;
}
