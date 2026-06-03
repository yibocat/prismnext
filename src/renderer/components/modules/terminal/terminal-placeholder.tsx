import { Terminal as TerminalIcon } from "lucide-react";

export function TerminalPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <TerminalIcon className="size-10 opacity-40" />
        <p className="text-sm">Open a terminal to get started</p>
      </div>
    </div>
  );
}
