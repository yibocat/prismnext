import { memo, useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTimeMs } from "@/lib/chat/relative-time";
import type { TurnMessageMeta } from "@/stores/chat-store";

export interface TurnRailPreview {
  text: string;
  hasAttachments: boolean;
  meta?: TurnMessageMeta;
}

interface TurnRailProps {
  /** Per-turn preview, index aligns with the global 0-based turn index. */
  previews: TurnRailPreview[];
  /** Virtual window start - turns before this are unmounted (rendered dimmed). */
  windowStart: number;
  /** The chat scroll container - watched to highlight the turn in view. */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onJump: (turnIndex: number) => void;
}

function PopoverPanel({ preview, index }: { preview: TurnRailPreview; index: number }) {
  const meta = preview.meta;
  return (
    <div
      data-chat-turn-popover
      className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[length:var(--font-chat-meta)] text-muted-foreground">
          <span>Turn {index + 1}</span>
          {meta?.completedAt ? (
            <span className="tabular-nums">{formatRelativeTimeMs(meta.completedAt, Date.now())}</span>
          ) : null}
        </div>
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-[length:var(--font-chat-message)] text-foreground">
          {preview.text.trim() || (preview.hasAttachments ? "(attachment)" : "(empty)")}
        </p>
        {meta?.modelLabel ? (
          <span className="truncate text-[length:var(--font-chat-meta)] text-muted-foreground/70">
            {meta.modelLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const TurnRail = memo(function TurnRail({
  previews,
  windowStart,
  scrollContainerRef,
  onJump,
}: TurnRailProps) {
  const [activeTurnIndex, setActiveTurnIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [popoverIndex, setPopoverIndex] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const popoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the turn at the viewport top (for the persistent highlight).
  const compute = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const sections = container.querySelectorAll("[data-chat-turn-index]");
    let active: number | null = null;
    for (const sec of sections) {
      const rect = (sec as HTMLElement).getBoundingClientRect();
      if (rect.bottom >= containerTop + 1) {
        const idx = sec.getAttribute("data-chat-turn-index");
        active = idx != null && idx !== "" ? Number(idx) : null;
        break;
      }
    }
    if (active == null && sections.length > 0) {
      const first = sections[0].getAttribute("data-chat-turn-index");
      active = first != null && first !== "" ? Number(first) : null;
    }
    setActiveTurnIndex((prev) => (prev === active ? prev : active));
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    };
    compute();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollContainerRef, compute, previews.length]);

  // Smooth scrub: map the pointer Y inside the rail to a turn index.
  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rail = railRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const n = previews.length;
      if (n === 0 || rect.height <= 0) return;
      const y = e.clientY - rect.top;
      const idx = Math.min(n - 1, Math.max(0, Math.floor((y / rect.height) * n)));
      setHoveredIndex((prev) => (prev === idx ? prev : idx));
    },
    [previews.length],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
    setPopoverIndex(null);
    if (popoverTimerRef.current != null) {
      clearTimeout(popoverTimerRef.current);
      popoverTimerRef.current = null;
    }
  }, []);

  // Debounce the popover so it follows the scrub but only opens after a dwell.
  useEffect(() => {
    if (hoveredIndex == null) {
      setPopoverIndex(null);
      return;
    }
    if (popoverTimerRef.current != null) clearTimeout(popoverTimerRef.current);
    popoverTimerRef.current = setTimeout(() => {
      setPopoverIndex(hoveredIndex);
    }, 150);
    return () => {
      if (popoverTimerRef.current != null) {
        clearTimeout(popoverTimerRef.current);
        popoverTimerRef.current = null;
      }
    };
  }, [hoveredIndex]);

  if (previews.length < 2) return null;

  return (
    <div
      ref={railRef}
      data-chat-turn-rail
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="absolute right-1 top-1/2 -translate-y-1/2 z-40 flex w-6 flex-col items-end gap-0.5 cursor-pointer"
    >
      {previews.map((preview, i) => {
        const isHovered = i === hoveredIndex;
        const isActive = i === activeTurnIndex;
        const isUnmounted = i < windowStart;
        const showPopover = i === popoverIndex;
        return (
          <div key={i} className="relative flex h-3 w-full items-center justify-end">
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-label={`Turn ${i + 1}`}
              className="relative flex h-3 w-full cursor-pointer items-center justify-end border-0 bg-transparent p-0"
            >
              <span
                data-chat-turn-bar
                className={cn(
                  "h-1 rounded-full transition-all duration-200 ease-out",
                  isHovered
                    ? "w-6 bg-foreground"
                    : isActive
                      ? "w-4 bg-primary/70"
                      : "w-3 bg-muted-foreground/30",
                  isUnmounted && !isHovered && !isActive && "opacity-40",
                )}
              />
            </button>
            {showPopover ? <PopoverPanel preview={preview} index={i} /> : null}
          </div>
        );
      })}
    </div>
  );
});
