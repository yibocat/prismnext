import { useCallback, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CopyIcon,
  FolderIcon,
  GitBranchIcon,
  ServerIcon,
  WorkflowIcon,
} from "lucide-react";
import { cn, writeClipboardText } from "@/lib/utils";
import { CHAT_PANEL_TOOLBAR_BUTTON } from "./worktree-selector";

function LocusChip({
  IdleIcon,
  value,
}: {
  IdleIcon: ComponentType<{ className?: string }>;
  value: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!value || copied) return;
    const ok = await writeClipboardText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [copied, value]);

  return (
    <button
      type="button"
      className={cn(CHAT_PANEL_TOOLBAR_BUTTON, "group/locus")}
      onClick={() => void onCopy()}
      title={copied ? t("common.copied") : value}
      aria-label={copied ? t("common.copied") : t("nav.sessions.copy")}
    >
      {copied ? (
        <CheckIcon className="size-3 shrink-0 text-success" />
      ) : (
        <>
          <IdleIcon className="size-3 shrink-0 group-hover/locus:hidden" />
          <CopyIcon className="hidden size-3 shrink-0 group-hover/locus:block" />
        </>
      )}
      <span className="hidden @[32rem]:inline">{value}</span>
    </button>
  );
}

function LocusDot() {
  return <span className="hidden shrink-0 opacity-40 @[32rem]:inline">·</span>;
}

export function ComposerSessionLocus({
  isRemote,
  projectName,
  hostLabel,
  branch,
  worktreeName,
}: {
  isRemote: boolean;
  projectName: string;
  hostLabel: string;
  branch: string | null;
  worktreeName: string | null;
}) {
  const showBranch = Boolean(branch && branch !== "...");
  const showWorktree = Boolean(worktreeName);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {isRemote ? (
        <LocusChip IdleIcon={ServerIcon} value={hostLabel} />
      ) : (
        <LocusChip IdleIcon={FolderIcon} value={projectName} />
      )}
      {showBranch ? (
        <>
          <LocusDot />
          <LocusChip IdleIcon={GitBranchIcon} value={branch ?? ""} />
        </>
      ) : null}
      {showWorktree ? (
        <>
          <LocusDot />
          <LocusChip IdleIcon={WorkflowIcon} value={worktreeName ?? ""} />
        </>
      ) : null}
    </div>
  );
}
