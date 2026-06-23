/** Attribute on the chat message scroll container. */
export const CHAT_SCROLL_CONTAINER_ATTR = "data-chat-scroll";

export type ViewportAnchorCapture = {
  container: HTMLElement;
  topBefore: number;
  scrollBefore: number;
};

export function captureViewportAnchor(anchor: HTMLElement): ViewportAnchorCapture | null {
  const container = anchor.closest(`[${CHAT_SCROLL_CONTAINER_ATTR}]`) as HTMLElement | null;
  if (!container) return null;
  return {
    container,
    topBefore: anchor.getBoundingClientRect().top,
    scrollBefore: container.scrollTop,
  };
}

/**
 * After expand/collapse below `anchor`, keep the anchor at the same viewport Y.
 * Uses scroll delta only — never snaps a turn's user header to the viewport top.
 */
export function restoreViewportAnchor(
  captured: ViewportAnchorCapture,
  anchor: HTMLElement,
): void {
  const { container } = captured;
  const topAfter = anchor.getBoundingClientRect().top;
  const delta = topAfter - captured.topBefore;
  const target = captured.scrollBefore + delta;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

  if (Math.abs(container.scrollTop - target) < 0.5) return;
  container.scrollTop = Math.max(0, Math.min(target, maxScroll));
}
