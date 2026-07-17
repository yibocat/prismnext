/**
 * Horizontal sortable tab strip — whole strip is the drop target; one insert line.
 * Used by RightArea TabBar and Chat open tabs.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type DragEvent,
} from "react";
import { cn } from "@/lib/utils";
import {
  clampClientXToTabRange,
  computeInsertIndex,
  isNoOpReorder,
  reorderIndex,
} from "@/lib/workspace/sortable-tab-strip";

export type SortableTabStripRenderArgs<T> = {
  item: T;
  index: number;
  dragging: boolean;
  dragHandleProps: {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
  };
};

type SortableTabStripProps<T> = {
  items: readonly T[];
  getKey: (item: T, index: number) => string;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Called when a drag starts — use to focus/activate that tab. */
  onDragItem?: (item: T, index: number) => void;
  disabled?: boolean;
  /** Flex sizing / outer layout (e.g. Chat `w-0 flex-1`). Do not put overflow here. */
  className?: string;
  /** Inner scrolling row (gap, justify-end, overflow-x-auto, …). */
  rowClassName?: string;
  renderItem: (args: SortableTabStripRenderArgs<T>) => ReactNode;
} & Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onDragOver" | "onDrop" | "onDragLeave" | "onDragEnd"
>;

export const SortableTabStrip = forwardRef(function SortableTabStrip<T>(
  {
    items,
    getKey,
    onReorder,
    onDragItem,
    disabled,
    className,
    rowClassName,
    renderItem,
    ...stripProps
  }: SortableTabStripProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  const insertIndexRef = useRef<number | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const count = items.length;
  const canDrag = Boolean(onReorder) && !disabled && count > 1;

  // Forward ref to the scrolling row (TabBar overflow measure); keep host for indicator.
  const setScrollerRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollerRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );

  const reset = useCallback(() => {
    dragFromRef.current = null;
    insertIndexRef.current = null;
    setDragFrom(null);
    setInsertIndex(null);
  }, []);

  const measureRects = useCallback(() => {
    return itemRefs.current.slice(0, count).map((el) => {
      if (!el) return { left: 0, width: 0 };
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width };
    });
  }, [count]);

  const resolveSlot = useCallback(
    (clientX: number) => {
      const rects = measureRects();
      const x = clampClientXToTabRange(clientX, rects);
      return computeInsertIndex(x, rects);
    },
    [measureRects],
  );

  const updateInsertFromClientX = useCallback(
    (clientX: number, from: number) => {
      const next = resolveSlot(clientX);
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

  const commitReorder = useCallback(
    (clientX: number | null) => {
      const from = dragFromRef.current;
      const reorder = onReorderRef.current;
      if (from === null || !reorder) {
        reset();
        return;
      }
      const slot =
        clientX != null
          ? resolveSlot(clientX)
          : insertIndexRef.current;
      reset();
      if (slot == null || isNoOpReorder(from, slot)) return;
      reorder(from, reorderIndex(from, slot));
    },
    [reset, resolveSlot],
  );

  // While dragging: keep receiving dragover/drop even if the pointer leaves the
  // strip (justify-end has zero native slack past the last tab; titlebar drag-region
  // also steals events one pixel outside).
  useEffect(() => {
    if (dragFrom === null || !canDrag) return;

    const onWindowDragOver = (e: globalThis.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      updateInsertFromClientX(e.clientX, dragFrom);
    };

    const onWindowDrop = (e: globalThis.DragEvent) => {
      e.preventDefault();
      commitReorder(e.clientX);
    };

    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, [canDrag, commitReorder, dragFrom, updateInsertFromClientX]);

  const onStripDragOver = useCallback(
    (e: DragEvent) => {
      if (dragFrom === null || !canDrag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      updateInsertFromClientX(e.clientX, dragFrom);
    },
    [canDrag, dragFrom, updateInsertFromClientX],
  );

  const onStripDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      commitReorder(e.clientX);
    },
    [commitReorder],
  );

  const indicatorLeft = (() => {
    if (insertIndex === null || dragFrom === null) return null;
    const host = hostRef.current;
    if (!host) return null;
    const hostLeft = host.getBoundingClientRect().left;
    const rects = measureRects();
    // Keep the 2px line fully inside the host — end slot sits on the last tab's
    // right edge, which is flush with the strip under justify-end; without an
    // inset the line is clipped by overflow / the titlebar's overflow-hidden.
    const inset = 2;
    if (insertIndex >= rects.length) {
      const last = rects[rects.length - 1];
      if (!last) return 0;
      return Math.max(0, last.left + last.width - hostLeft - inset);
    }
    const r = rects[insertIndex];
    if (!r) return null;
    return Math.max(0, r.left - hostLeft);
  })();

  return (
    <div
      {...stripProps}
      ref={hostRef}
      className={cn("no-drag relative h-full min-w-0", className)}
      onDragOver={onStripDragOver}
      onDrop={onStripDrop}
      onDragEnd={reset}
    >
      <div
        ref={setScrollerRef}
        className={cn(
          "flex h-full min-w-0 items-center",
          rowClassName,
        )}
      >
        {items.map((item, index) => (
          <div
            key={getKey(item, index)}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className="relative flex h-full shrink-0 items-center"
          >
            {renderItem({
              item,
              index,
              dragging: dragFrom === index,
              dragHandleProps: {
                draggable: canDrag,
                onDragStart: (e: DragEvent) => {
                  if (!canDrag) {
                    e.preventDefault();
                    return;
                  }
                  dragFromRef.current = index;
                  insertIndexRef.current = null;
                  setDragFrom(index);
                  setInsertIndex(null);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                  onDragItem?.(item, index);
                },
              },
            })}
          </div>
        ))}
      </div>

      {indicatorLeft != null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 z-10 w-0.5 rounded-full bg-primary"
          style={{ left: indicatorLeft }}
        />
      ) : null}
    </div>
  );
}) as <T>(
  props: SortableTabStripProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactElement | null;
