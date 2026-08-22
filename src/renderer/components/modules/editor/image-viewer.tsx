import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useTabContext } from "@/lib/workspace/tab-context";
import { tabFileId } from "@/lib/workspace/mode-registry";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;
/** Discrete ± for toolbar buttons. */
const BUTTON_ZOOM_STEP = 1.18;
/**
 * Trackpad pinch / ctrl-wheel damping (higher = more sensitive).
 */
const WHEEL_ZOOM_DAMP = 0.004;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function ImageViewer() {
  const { t } = useTranslation();
  const { tab } = useTabContext();
  const fileId = tabFileId(tab);
  const dataUrl = useDocumentStore((s) =>
    fileId ? s.openedContents.get(fileId)?.dataUrl : undefined,
  );

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    dragRef.current = null;
    setDragging(false);
  }, [fileId, dataUrl]);

  const setScaleClamped = useCallback((next: number) => {
    const clamped = clampScale(next);
    setScale(clamped);
    scaleRef.current = clamped;
    if (clamped <= 1) {
      setOffset({ x: 0, y: 0 });
      offsetRef.current = { x: 0, y: 0 };
    }
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      setScaleClamped(scaleRef.current * factor);
    },
    [setScaleClamped],
  );

  // Non-passive wheel: pinch-zoom (ctrl/meta) + directional pan when zoomed.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Normalize line/page deltas so mouse notches ≈ trackpad pixels.
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        else if (e.deltaMode === 2) dy *= 320;
        const factor = Math.exp(-dy * WHEEL_ZOOM_DAMP);
        setScaleClamped(scaleRef.current * factor);
        return;
      }

      // Two-finger swipe / mouse wheel pans when zoomed in.
      if (scaleRef.current > 1) {
        const next = {
          x: offsetRef.current.x - e.deltaX,
          y: offsetRef.current.y - e.deltaY,
        };
        offsetRef.current = next;
        setOffset(next);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setScaleClamped, dataUrl]);

  if (!dataUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-[length:var(--font-placeholder)]">Image cannot be displayed</p>
        <p className="text-[length:var(--font-placeholder)] opacity-50">
          File too large or unsupported format
        </p>
      </div>
    );
  }

  const canPan = scale > 1;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[repeating-conic-gradient(var(--muted)_0%_25%,transparent_0%_50%)_50%/16px_16px]">
      <div
        ref={surfaceRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden touch-none",
          canPan ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
        )}
        onPointerDown={(e) => {
          if (!canPan || e.button !== 0) return;
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: offsetRef.current.x,
            originY: offsetRef.current.y,
          };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const next = {
            x: drag.originX + (e.clientX - drag.startX),
            y: drag.originY + (e.clientY - drag.startY),
          };
          offsetRef.current = next;
          setOffset(next);
        }}
        onPointerUp={(e) => {
          if (dragRef.current?.pointerId === e.pointerId) {
            dragRef.current = null;
            setDragging(false);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onDoubleClick={() => {
          if (scale > 1) {
            setScale(1);
            scaleRef.current = 1;
            setOffset({ x: 0, y: 0 });
            offsetRef.current = { x: 0, y: 0 };
          } else {
            setScaleClamped(2);
          }
        }}
      >
        <img
          src={dataUrl}
          alt={tab.title ?? ""}
          draggable={false}
          className="pointer-events-none absolute top-1/2 left-1/2 max-h-full max-w-full select-none rounded object-contain shadow-lg"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>

      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-md">
        <Hint label={t("chat.composer.zoomOut")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("chat.composer.zoomOut")}
            disabled={scale <= MIN_SCALE}
            onClick={() => zoomBy(1 / BUTTON_ZOOM_STEP)}
          >
            <MinusIcon />
          </Button>
        </Hint>
        <Hint label={t("chat.composer.zoomIn")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("chat.composer.zoomIn")}
            disabled={scale >= MAX_SCALE}
            onClick={() => zoomBy(BUTTON_ZOOM_STEP)}
          >
            <PlusIcon />
          </Button>
        </Hint>
      </div>
    </div>
  );
}
