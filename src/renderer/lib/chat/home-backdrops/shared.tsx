import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Radial mask keeps the centered composer area calm. */
export const CHAT_HOME_BACKDROP_MASK =
  "[mask-image:radial-gradient(ellipse_76%_62%_at_50%_46%,#000_16%,transparent_78%)]";

export function ChatHomeBackdropShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        CHAT_HOME_BACKDROP_MASK,
        className,
      )}
      aria-hidden
    >
      {children}
    </div>
  );
}
