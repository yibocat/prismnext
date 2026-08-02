import type { ReactNode } from "react";
import { ChatFileInline } from "./chat-file-inline";

interface ChatFileLinkProps {
  path: string;
  children?: ReactNode;
  className?: string;
  /** Shown on hover when children omit the full path. */
  title?: string;
}

/** Tool widgets + markdown — opens RightArea and focuses the project file. */
export function ChatFileLink({
  path,
  children,
  className,
  title,
}: ChatFileLinkProps) {
  const label =
    typeof children === "string" && children.trim() ? children : undefined;

  return (
    <ChatFileInline
      path={path}
      label={label}
      title={title}
      className={className}
    />
  );
}
