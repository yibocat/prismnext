import {
  Archive,
  CircleAlert,
  Dot,
  WorkflowIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionIconConfig } from "@shared/chat/session-chrome";
import {
  resolveSessionIcon,
  sessionIconColorClass,
} from "@/lib/chat/session-icon-registry";
import {
  deriveSessionListStatus,
  type SessionListStatusInput,
  type SessionListStatusKind,
} from "@/lib/chat/session-status";

const BADGE_CLASS: Partial<Record<SessionListStatusKind, string>> = {
  waiting: "bg-warning",
  "running-stream": "bg-primary",
  "running-terminal": "bg-warning",
  unread: "bg-primary",
};

interface SessionStatusIndicatorProps extends SessionListStatusInput {
  className?: string;
  customIcon?: SessionIconConfig | null;
  implicitWorktree?: boolean;
}

function RunningDot({ tone }: { tone: "primary" | "warning" }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full session-status-pulse",
        tone === "warning" ? "bg-warning" : "bg-primary",
      )}
      aria-hidden
    />
  );
}

function StatusDot({ kind }: { kind: SessionListStatusKind }) {
  switch (kind) {
    case "archived":
      return <Archive className="size-4 text-muted-foreground/70" />;
    case "waiting":
      return <CircleAlert className="size-4 text-warning" strokeWidth={2.5} />;
    case "running-stream":
      return <RunningDot tone="primary" />;
    case "running-terminal":
      return <RunningDot tone="warning" />;
    case "unread":
      return (
        <Dot
          className="size-4 text-primary"
          strokeWidth={5.5}
        />
      );
    case "read":
    default:
      return (
        <Dot
          className="size-4 text-muted-foreground/30"
          strokeWidth={5.5}
        />
      );
  }
}

function StatusBadge({ kind }: { kind: SessionListStatusKind }) {
  const color = BADGE_CLASS[kind];
  if (!color) return null;
  const pulse = kind === "running-stream" || kind === "running-terminal";
  return (
    <span
      className={cn(
        "pointer-events-none absolute -bottom-px -right-px size-1.5 rounded-full ring-1 ring-background",
        color,
        pulse && "session-status-pulse",
      )}
      aria-hidden
    />
  );
}

/**
 * Leading mark for a session row: colored dot, or custom / implicit icon + status badge.
 */
export function SessionStatusIndicator({
  className,
  customIcon,
  implicitWorktree = false,
  ...input
}: SessionStatusIndicatorProps) {
  const status = deriveSessionListStatus(input);
  const resolved = status.kind === "archived" ? null : resolveSessionIcon(customIcon);
  const showImplicitWorktree = implicitWorktree && status.kind === "read" && !resolved;

  if (resolved) {
    return (
      <span className={cn("relative flex size-4 shrink-0 items-center justify-center", className)}>
        {resolved.kind === "emoji" ? (
          <span className="text-[13px] leading-none">{resolved.value}</span>
        ) : (
          <resolved.Icon
            className={cn("size-3.5", sessionIconColorClass(resolved.color))}
            strokeWidth={2}
          />
        )}
        {status.showStatusBadge ? <StatusBadge kind={status.kind} /> : null}
      </span>
    );
  }

  if (showImplicitWorktree) {
    return (
      <span className={cn("relative flex size-4 shrink-0 items-center justify-center", className)}>
        <WorkflowIcon
          className="size-3.5 text-primary"
          strokeWidth={2}
        />
      </span>
    );
  }

  return (
    <span className={cn("relative flex size-4 shrink-0 items-center justify-center", className)}>
      <StatusDot kind={status.kind} />
    </span>
  );
}
