import type { ReactNode } from "react";
import { ChatFileInline } from "./chat-file-inline";

interface ChatFileLinkProps {
  path: string;
  children?: ReactNode;
  className?: string;
  /** Shown on hover when children omit the full path. */
  title?: string;
  /** Jump to this 1-based line after opening. */
  line?: number;
}

/** Tool widgets + markdown — opens RightArea and focuses the project file. */
export function ChatFileLink({
  path,
  children,
  className,
  title,
  line,
}: ChatFileLinkProps) {
  const label =
    typeof children === "string" && children.trim() ? children : undefined;

  return (
    <ChatFileInline
      path={path}
      label={label}
      title={title}
      className={className}
      line={line}
    />
  );
}
