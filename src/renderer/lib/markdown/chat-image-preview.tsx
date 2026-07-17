import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const ZOOM_STEP = 1.2;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function ChatImagePreviewDialog({
  open,
  onOpenChange,
  url,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  name: string;
}) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      dragRef.current = null;
      setDragging(false);
    }
  }, [open, url]);

  const setScaleClamped = (next: number) => {
    const clamped = clampScale(next);
    setScale(clamped);
    if (clamped <= MIN_SCALE) setOffset({ x: 0, y: 0 });
  };

  const zoomBy = (factor: number) => {
    setScaleClamped(scale * factor);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex h-[min(94vh,56rem)] w-[min(96vw,90rem)] max-w-[min(96vw,90rem)] flex-col gap-0 overflow-hidden border-border/80 bg-background p-0 shadow-2xl",
          "sm:max-w-[min(96vw,90rem)]",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{name || t("chat.composer.imagePreview")}</DialogTitle>

        <DialogClose asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={t("common.close")}
            className="absolute top-3 right-3 z-20 shadow-sm"
          >
            <XIcon />
          </Button>
        </DialogClose>

        <div
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden bg-muted/40",
            scale > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
          )}
          onPointerDown={(e) => {
            if (scale <= MIN_SCALE || e.button !== 0) return;
            dragRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              originX: offset.x,
              originY: offset.y,
            };
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            setOffset({
              x: drag.originX + (e.clientX - drag.startX),
              y: drag.originY + (e.clientY - drag.startY),
            });
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
            if (scale > MIN_SCALE) {
              setScale(MIN_SCALE);
              setOffset({ x: 0, y: 0 });
            } else {
              setScaleClamped(2);
            }
          }}
        >
          {url ? (
            <img
              src={url}
              alt={name}
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-h-full max-w-full select-none object-contain"
              style={{
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transformOrigin: "center center",
              }}
            />
          ) : null}
        </div>

        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-md">
          <Hint label={t("chat.composer.zoomOut")}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("chat.composer.zoomOut")}
              disabled={scale <= MIN_SCALE}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <MinusIcon />
            </Button>
          </Hint>
          <span className="min-w-10 px-1 text-center font-sans text-[length:var(--font-menu-item)] text-muted-foreground tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Hint label={t("chat.composer.zoomIn")}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("chat.composer.zoomIn")}
              disabled={scale >= MAX_SCALE}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <PlusIcon />
            </Button>
          </Hint>
        </div>
      </DialogContent>
    </Dialog>
  );
}
