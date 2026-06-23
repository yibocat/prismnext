import { Terminal as TerminalIcon } from "lucide-react";

type TerminalPlaceholderReason = "no-project" | "no-root" | "empty";

interface TerminalPlaceholderProps {
  reason?: TerminalPlaceholderReason;
}

const MESSAGES: Record<TerminalPlaceholderReason, string> = {
  "no-project": "Open a project to start a terminal",
  "no-root": "Unable to resolve a working directory for the terminal",
  empty: "Create a terminal session to get started",
};

export function TerminalPlaceholder({ reason = "empty" }: TerminalPlaceholderProps) {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <TerminalIcon className="size-10 opacity-40" />
        <p className="text-[length:var(--font-placeholder)]">{MESSAGES[reason]}</p>
      </div>
    </div>
  );
}
