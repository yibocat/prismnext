import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ComposerChromePeekStrip } from "./composer-chrome-card";

/** Lower order = higher priority (closest to composer when expanded). */
export type ComposerChromeStackItem = {
  id: string;
  order: number;
  peekLabel: string;
  content: ReactNode;
};

const PEEK_HEIGHT_PX = 12;

export function ComposerChromeStackBody({
  items,
  className,
}: {
  items: ComposerChromeStackItem[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.order - b.order),
    [items],
  );

  if (sorted.length === 0) return null;

  if (sorted.length === 1) {
    return <div className={cn("mb-2 w-full", className)}>{sorted[0]!.content}</div>;
  }

  const peekCount = sorted.length - 1;
  const front = sorted[0]!;
  const peeks = sorted.slice(1);

  return (
    <div
      className={cn("relative mb-2 w-full", className)}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setExpanded(false);
        }
      }}
    >
      {!expanded ? (
        <div
          className="relative"
          style={{ paddingTop: peekCount * PEEK_HEIGHT_PX }}
        >
          {peeks.map((item, index) => (
            <div
              key={item.id}
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: index * PEEK_HEIGHT_PX,
                zIndex: index + 1,
              }}
            >
              <ComposerChromePeekStrip label={item.peekLabel} />
            </div>
          ))}
          <div className="relative z-20">{front.content}</div>
          <span
            className="absolute right-1.5 top-0.5 z-30 rounded-full border border-border bg-card px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground shadow-sm"
            aria-hidden
          >
            {sorted.length}
          </span>
        </div>
      ) : (
        <div className="flex max-h-[min(60vh,520px)] flex-col-reverse gap-2 overflow-y-auto pr-0.5">
          {sorted.map((item) => (
            <div key={item.id} className="shrink-0">
              {item.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
