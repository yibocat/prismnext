import { useEffect, useRef, useState, type RefObject } from "react";

export type MarqueeRect = { left: number; top: number; width: number; height: number };

const DRAG_THRESHOLD_PX = 4;
const AUTO_SCROLL_EDGE_PX = 28;
const AUTO_SCROLL_STEP_PX = 14;

export function normalizeMarqueeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): MarqueeRect {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    left,
    top,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function rectsIntersect(a: MarqueeRect, b: DOMRect): boolean {
  const right = a.left + a.width;
  const bottom = a.top + a.height;
  return !(b.right < a.left || b.left > right || b.bottom < a.top || b.top > bottom);
}

export function collectRowIdsInMarquee(
  root: ParentNode,
  marquee: MarqueeRect,
  rowSelector = "[data-literature-row-shell]",
): string[] {
  const ids: string[] = [];
  for (const el of root.querySelectorAll(rowSelector)) {
    if (!(el instanceof HTMLElement)) continue;
    const id = el.dataset.literatureRowId;
    if (!id) continue;
    if (rectsIntersect(marquee, el.getBoundingClientRect())) {
      ids.push(id);
    }
  }
  return ids;
}

function isMarqueeIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return Boolean(
    target.closest(
      'input, button, a, textarea, select, [data-literature-pdf-open], [data-literature-composer-drag], [contenteditable="true"]',
    ),
  );
}

function autoScrollNearEdge(scrollEl: HTMLElement, clientY: number): void {
  const rect = scrollEl.getBoundingClientRect();
  if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
    scrollEl.scrollTop -= AUTO_SCROLL_STEP_PX;
  } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
    scrollEl.scrollTop += AUTO_SCROLL_STEP_PX;
  }
}

/** Drag a selection box across library rows (Shift = add to existing selection). */
export function useLiteratureListMarquee(opts: {
  scrollRef: RefObject<HTMLDivElement | null>;
  listBodyRef: RefObject<HTMLDivElement | null>;
  checkedPaperIds: string[];
  setCheckedPaperIds: (ids: string[]) => void;
  enabled?: boolean;
}) {
  const { scrollRef, listBodyRef, checkedPaperIds, setCheckedPaperIds, enabled = true } = opts;
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const suppressRowClickRef = useRef(false);
  const checkedRef = useRef(checkedPaperIds);
  checkedRef.current = checkedPaperIds;

  useEffect(() => {
    if (!enabled) return;
    const scrollEl = scrollRef.current;
    const listEl = listBodyRef.current;
    if (!scrollEl || !listEl) return;

    type Session = {
      active: boolean;
      startX: number;
      startY: number;
      additive: boolean;
      baseIds: string[];
    };

    let session: Session | null = null;

    const cancelSession = (revertSelection: boolean) => {
      if (session?.active && revertSelection) {
        setCheckedPaperIds(session.additive ? session.baseIds : []);
      }
      session = null;
      setMarqueeRect(null);
      document.body.style.removeProperty("user-select");
    };

    const finish = () => {
      if (session?.active) {
        suppressRowClickRef.current = true;
        window.setTimeout(() => {
          suppressRowClickRef.current = false;
        }, 0);
      }
      cancelSession(false);
    };

    const onDragStart = () => {
      cancelSession(true);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (isMarqueeIgnoredTarget(e.target)) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (!scrollEl.contains(target)) return;

      const headerEl = scrollEl.querySelector("[data-literature-list-header]");
      if (headerEl?.contains(target)) return;

      session = {
        active: false,
        startX: e.clientX,
        startY: e.clientY,
        additive: e.shiftKey,
        baseIds: e.shiftKey ? [...checkedRef.current] : [],
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!session) return;

      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (!session.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.active = true;
        document.body.style.userSelect = "none";
      }

      const rect = normalizeMarqueeRect(session.startX, session.startY, e.clientX, e.clientY);
      setMarqueeRect(rect);

      const hitIds = collectRowIdsInMarquee(listEl, rect);
      const merged = new Set([...(session.additive ? session.baseIds : []), ...hitIds]);
      setCheckedPaperIds([...merged]);

      autoScrollNearEdge(scrollEl, e.clientY);
    };

    scrollEl.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", finish);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("blur", finish);

    return () => {
      scrollEl.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", finish);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("blur", finish);
      finish();
    };
  }, [enabled, listBodyRef, scrollRef, setCheckedPaperIds]);

  return { marqueeRect, suppressRowClickRef };
}
