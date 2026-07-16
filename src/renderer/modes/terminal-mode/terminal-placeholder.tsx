import { useTranslation } from "react-i18next";
import { Terminal as TerminalIcon } from "lucide-react";

type TerminalPlaceholderReason = "no-project" | "no-root" | "empty";

interface TerminalPlaceholderProps {
  reason?: TerminalPlaceholderReason;
}

export function TerminalPlaceholder({ reason = "empty" }: TerminalPlaceholderProps) {
  const { t } = useTranslation();
  const messages: Record<TerminalPlaceholderReason, string> = {
    "no-project": t("modes.terminal.openProject"),
    "no-root": t("modes.terminal.noRoot"),
    empty: t("modes.terminal.createSession"),
  };

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <TerminalIcon className="size-10 opacity-40" />
        <p className="text-[length:var(--font-placeholder)]">{messages[reason]}</p>
      </div>
    </div>
  );
}
