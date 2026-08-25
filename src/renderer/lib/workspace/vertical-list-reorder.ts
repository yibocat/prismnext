import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  computeVerticalInsertIndex,
  isNoOpReorder,
  reorderIndex,
  shouldSuppressClickAfterDrag,
} from "@/lib/workspace/sortable-tab-strip";

export const VERTICAL_LIST_REORDER_EDGE_SLACK_PX = 36;
export const VERTICAL_LIST_REORDER_SCROLL_ZONE_PX = 48;
export const VERTICAL_LIST_REORDER_SCROLL_STEP_PX = 14;

function nearestOverflowY(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export type VerticalListReorderOptions = {
  edgeSlackPx?: number;
  scrollZonePx?: number;
  scrollStepPx?: number;
  ignoreSelector?: string;
};

/** Same vertical reorder as the workbench project list: whole row, insert line, window drop. */
export function useVerticalListReorder(
  count: number,
  enabled: boolean,
  onReorder: (from: number, to: number) => void,
  options?: VerticalListReorderOptions,
) {
  const edgeSlackPx = options?.edgeSlackPx ?? VERTICAL_LIST_REORDER_EDGE_SLACK_PX;
  const scrollZonePx = options?.scrollZonePx ?? VERTICAL_LIST_REORDER_SCROLL_ZONE_PX;
  const scrollStepPx = options?.scrollStepPx ?? VERTICAL_LIST_REORDER_SCROLL_STEP_PX;
  const ignoreSelector = options?.ignoreSelector ?? "[data-list-drag-ignore]";

  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const insertIndexRef = useRef<number | null>(null);
  const pointerYRef = useRef<number | null>(null);
  const dragEndedAtRef = useRef<number | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const reset = useCallback(() => {
    dragFromRef.current = null;
    insertIndexRef.current = null;
    pointerYRef.current = null;
    setDragFrom(null);
    setInsertIndex(null);
  }, []);

  const measureRects = useCallback(() => {
    return itemRefs.current.slice(0, count).map((el) => {
      if (!el) return { top: 0, height: 0 };
      const rect = el.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
  }, [count]);

  const resolveSlot = useCallback(
    (clientY: number) => {
      return computeVerticalInsertIndex(clientY, measureRects(), edgeSlackPx);
    },
    [edgeSlackPx, measureRects],
  );

  const updateInsert = useCallback(
    (clientY: number, from: number) => {
      const next = resolveSlot(clientY);
      if (isNoOpReorder(from, next)) {
        insertIndexRef.current = null;
        setInsertIndex(null);
      } else {
        insertIndexRef.current = next;
        setInsertIndex(next);
      }
    },
    [resolveSlot],
  );

  const commit = useCallback(
    (clientY: number | null) => {
      const from = dragFromRef.current;
      const reorder = onReorderRef.current;
      if (from === null || !reorder) {
        reset();
        return;
      }
      const slot = clientY != null ? resolveSlot(clientY) : insertIndexRef.current;
      dragEndedAtRef.current = Date.now();
      reset();
      if (slot == null || isNoOpReorder(from, slot)) return;
      reorder(from, reorderIndex(from, slot));
    },
    [reset, resolveSlot],
  );

  useEffect(() => {
    if (dragFrom === null || !enabled) return;

    const onWindowDragOver = (event: globalThis.DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      pointerYRef.current = event.clientY;
      updateInsert(event.clientY, dragFrom);
    };
    const onWindowDrop = (event: globalThis.DragEvent) => {
      event.preventDefault();
      commit(event.clientY);
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);

    let frame = 0;
    const tick = () => {
      const y = pointerYRef.current;
      const scroller = nearestOverflowY(listRef.current);
      if (y != null && scroller) {
        const bounds = scroller.getBoundingClientRect();
        if (y < bounds.top + scrollZonePx) {
          scroller.scrollTop -= scrollStepPx;
          updateInsert(y, dragFrom);
        } else if (y > bounds.bottom - scrollZonePx) {
          scroller.scrollTop += scrollStepPx;
          updateInsert(y, dragFrom);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
      cancelAnimationFrame(frame);
    };
  }, [commit, dragFrom, enabled, scrollStepPx, scrollZonePx, updateInsert]);

  const consumeSkipClick = useCallback(() => {
    return shouldSuppressClickAfterDrag(Date.now(), dragEndedAtRef.current);
  }, []);

  const indicatorTop = (() => {
    if (insertIndex === null || dragFrom === null) return null;
    const host = listRef.current;
    if (!host) return null;
    const hostTop = host.getBoundingClientRect().top;
    const rects = measureRects();
    if (insertIndex >= rects.length) {
      const last = rects[rects.length - 1];
      if (!last) return 0;
      return last.top + last.height - hostTop;
    }
    const rect = rects[insertIndex];
    return rect ? rect.top - hostTop : null;
  })();

  return {
    listRef,
    draggingIndex: dragFrom,
    indicatorTop,
    consumeSkipClick,
    listProps: {
      onDragOver: (event: DragEvent) => {
        if (dragFrom === null || !enabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        updateInsert(event.clientY, dragFrom);
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        commit(event.clientY);
      },
      onDragEnd: () => {
        if (dragFromRef.current != null) dragEndedAtRef.current = Date.now();
        reset();
      },
    },
    itemProps: (index: number) => ({
      ref: (el: HTMLDivElement | null) => {
        itemRefs.current[index] = el;
      },
      dragHandleProps: {
        draggable: enabled,
        onDragStart: (event: DragEvent) => {
          if (!enabled || (event.target as HTMLElement).closest(ignoreSelector)) {
            event.preventDefault();
            return;
          }
          dragFromRef.current = index;
          insertIndexRef.current = null;
          setDragFrom(index);
          setInsertIndex(null);
          event.dataTransfer.setData("text/x-prismnext-list-reorder", String(index));
          event.dataTransfer.effectAllowed = "move";
        },
      },
    }),
  };
}
