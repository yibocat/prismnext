import { useTranslation } from "react-i18next";
import { PlugIcon } from "lucide-react";
import { parseRemoteAbs } from "@shared/remote";
import { CHAT_PANEL_TOOLBAR_OUTLINE_BUTTON } from "@/components/modules/chat/worktree-selector";
import { useDocumentStore } from "@/stores/document-store";
import { useRemoteStore } from "@/stores/remote-store";
import { cn } from "@/lib/utils";

/** Centered Connect for RightArea modes that talk to the Host. */
export function RemoteConnectPrompt() {
  const { t } = useTranslation();
  const root = useDocumentStore((s) => s.projectRoot);
  const openConnectDialog = useRemoteStore((s) => s.openConnectDialog);
  const parsed = parseRemoteAbs(root ?? "");
  if (!parsed) return null;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-sm text-[length:var(--font-size-12)] text-muted-foreground">
        {t("remote.workspaceOffline")}
      </p>
      <button
        type="button"
        className={cn(CHAT_PANEL_TOOLBAR_OUTLINE_BUTTON, "h-8 px-2.5")}
        onClick={() => openConnectDialog(parsed.profileId, { autoCloseOnReady: true })}
      >
        <PlugIcon className="size-3 shrink-0" />
        <span>{t("remote.connect")}</span>
      </button>
    </div>
  );
}
