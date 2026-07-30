import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const ComposerChromeCard = forwardRef(function ComposerChromeCard({
  className,
  children,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLDivElement>, ref: React.Ref<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      className={cn("rounded-lg border border-border bg-card", className)}
      {...props}
    >
      {children}
    </div>
  );
});

/** Strip shown when a card is tucked behind the front card in the stack. */
export function ComposerChromePeekStrip({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="truncate px-3 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
