import { forwardRef, type ReactNode, type HTMLAttributes } from "react";
import { XIcon } from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared height for AiBar + Task run float panels (CSS length). */
export const CHAT_FLOAT_PANEL_HEIGHT = "min(72vh, 720px)";

/**
 * Shared float shell for AiBar run panel and Task/subagent run panel —
 * same chrome: card, header title + close, scrollable body.
 */
export const ChatFloatPanel = forwardRef<
  HTMLDivElement,
  {
    title: ReactNode;
    onClose?: () => void;
    closeLabel?: string;
    /** Extra controls before the close button (e.g. Stop). */
    headerEnd?: ReactNode;
    footer?: ReactNode;
    /** Fill a parent-sized slot (AiBar stack / host). */
    fillHeight?: boolean;
    children: ReactNode;
    className?: string;
    /** data-* marker for outside-click / drop targeting. */
    panelAttr?: "data-ai-bar-panel" | "data-subagent-run-panel";
  } & Omit<HTMLAttributes<HTMLDivElement>, "title" | "children">
>(function ChatFloatPanel(
  {
    title,
    onClose,
    closeLabel,
    headerEnd,
    footer,
    fillHeight = false,
    children,
    className,
    panelAttr = "data-ai-bar-panel",
    ...rest
  },
  ref,
) {
  const attrProps =
    panelAttr === "data-subagent-run-panel"
      ? { "data-subagent-run-panel": true as const }
      : { "data-ai-bar-panel": true as const };

  return (
    <div
      ref={ref}
      {...attrProps}
      className={cn(
        "relative flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        fillHeight ? "h-full" : "max-h-[min(72vh,720px)]",
        className,
      )}
      {...rest}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <div className="min-w-0 flex-1 truncate text-[length:var(--font-chat-meta)] text-muted-foreground">
          {title}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {headerEnd}
          {onClose ? (
            <Hint label={closeLabel || "Close"}>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                <XIcon className="size-3.5" />
              </Button>
            </Hint>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer}
    </div>
  );
});
