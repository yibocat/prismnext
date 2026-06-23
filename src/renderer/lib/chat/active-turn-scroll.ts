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
