import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { openProjectFileFromChat } from "@/lib/files/open-project-file";

interface ChatFileLinkProps {
  path: string;
  children?: ReactNode;
  className?: string;
  /** Shown on hover when children omit the full path. */
  title?: string;
}

export function ChatFileLink({
  path,
  children,
  className,
  title,
}: ChatFileLinkProps) {
  const display = children ?? (path.split("/").pop() || path);

  return (
    <span
      role="link"
      tabIndex={0}
      className={cn(
        "truncate font-medium text-primary/90 hover:text-primary hover:underline underline-offset-2 cursor-pointer",
        className,
      )}
      title={title ?? path}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        void openProjectFileFromChat(path);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        void openProjectFileFromChat(path);
      }}
    >
      {display}
    </span>
  );
}
