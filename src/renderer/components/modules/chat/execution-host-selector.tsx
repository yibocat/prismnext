import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LaptopIcon, MonitorIcon, PlugIcon, WorkflowIcon } from "lucide-react";
import { parseRemoteAbs } from "@shared/remote";
import { remotePhaseIsReady, remotePhaseNeedsConnect } from "@/lib/remote/ensure-connected";
import { Hint } from "@/components/ui/hint";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { SshHostPickerDialog } from "@/components/modules/remote/ssh-host-picker-dialog";
import { formatHostWorktreeLabel } from "@/lib/git/checkout-context";
import {
  executionHostLabel,
  remoteConnectionPhaseForRoot,
} from "@/lib/remote/display";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useRemoteStore } from "@/stores/remote-store";
import {
  CHAT_PANEL_TOOLBAR_BUTTON,
  CHAT_PANEL_TOOLBAR_OUTLINE_BUTTON,
  useWorktreeHostSuffix,
  WorktreeHostMenuSection,
} from "./worktree-selector";

function hostDotClass(phase: string | null): string {
  if (phase === "ready") return "bg-success";
  if (
    phase === "connecting"
    || phase === "bootstrapping"
    || phase === "reconnecting"
    || phase === "awaiting_host_key"
  ) {
    return "bg-warning";
  }
  if (phase === "error") return "bg-destructive";
  return "bg-muted-foreground";
}

export function RemoteOneClickConnectButton() {
  const { t } = useTranslation();
  const root = useDocumentStore((s) => s.projectRoot);
  const byProfileId = useRemoteStore((s) => s.byProfileId);
  const openConnectDialog = useRemoteStore((s) => s.openConnectDialog);
  const parsed = parseRemoteAbs(root ?? "");
  const phase = remoteConnectionPhaseForRoot(root, byProfileId) ?? undefined;
  if (!parsed || !remotePhaseNeedsConnect(phase) || remotePhaseIsReady(phase)) return null;

  return (
    <Hint label={t("chat.toolbar.connectNow")}>
      <button
        type="button"
        className={CHAT_PANEL_TOOLBAR_OUTLINE_BUTTON}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => openConnectDialog(parsed.profileId, { autoCloseOnReady: true })}
      >
        <PlugIcon className="size-3 shrink-0" />
        <span className="hidden @md:inline">{t("chat.toolbar.connectNow")}</span>
      </button>
    </Hint>
  );
}

export function ExecutionHostSelector() {
  const { t } = useTranslation();
  const root = useDocumentStore((s) => s.projectRoot);
  const hosts = useRemoteStore((s) => s.hosts);
  const byProfileId = useRemoteStore((s) => s.byProfileId);
  const openConnectDialog = useRemoteStore((s) => s.openConnectDialog);
  const [sshPickerOpen, setSshPickerOpen] = useState(false);
  const worktreeSuffix = useWorktreeHostSuffix();

  const hostLabel = executionHostLabel(root, hosts, t("chat.toolbar.hostLocal"));
  const triggerLabel = formatHostWorktreeLabel(hostLabel, worktreeSuffix);
  const parsed = parseRemoteAbs(root ?? "");
  const phase = remoteConnectionPhaseForRoot(root, byProfileId);

  return (
    <>
      <AppMenu>
        <Hint label={triggerLabel}>
          <AppMenuTrigger asChild>
            <button
              type="button"
              className={CHAT_PANEL_TOOLBAR_BUTTON}
              onMouseDown={(event) => event.preventDefault()}
            >
              {parsed ? (
                <span className={cn("size-1.5 shrink-0 rounded-full", hostDotClass(phase))} />
              ) : null}
              {worktreeSuffix ? (
                <WorkflowIcon className="size-3 shrink-0 text-primary" />
              ) : parsed ? (
                <MonitorIcon className="size-3 shrink-0" />
              ) : (
                <LaptopIcon className="size-3 shrink-0" />
              )}
              <span className="hidden @md:inline-flex min-w-0 max-w-[12.5rem] items-center gap-1">
                <span className="min-w-0 truncate">{hostLabel}</span>
                {worktreeSuffix ? (
                  <>
                    <span className="shrink-0 opacity-40">·</span>
                    <span className="min-w-0 max-w-[6.5rem] shrink-0 truncate">{worktreeSuffix}</span>
                  </>
                ) : null}
              </span>
            </button>
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent align="start" className="w-56">
          {parsed ? (
            <>
              <AppMenuCheckItem
                selected
                leading={<MonitorIcon className="size-3.5 shrink-0 opacity-70" />}
              >
                {hostLabel}
              </AppMenuCheckItem>
              <AppMenuItem
                leading={<PlugIcon className="size-3.5 shrink-0 opacity-70" />}
                onClick={() => openConnectDialog(parsed.profileId)}
              >
                {t("chat.toolbar.hostStatus")}
              </AppMenuItem>
            </>
          ) : (
            <>
              <AppMenuCheckItem
                selected
                leading={<LaptopIcon className="size-3.5 shrink-0 opacity-70" />}
              >
                {t("chat.toolbar.hostLocal")}
              </AppMenuCheckItem>
              <AppMenuItem
                leading={<PlugIcon className="size-3.5 shrink-0 opacity-70" />}
                onClick={() => setSshPickerOpen(true)}
              >
                {t("chat.toolbar.connectRemote")}
              </AppMenuItem>
            </>
          )}
          <WorktreeHostMenuSection />
        </AppMenuContent>
      </AppMenu>
      <SshHostPickerDialog
        open={sshPickerOpen}
        onOpenChange={setSshPickerOpen}
        onSelectHost={(alias) => openConnectDialog(alias)}
      />
    </>
  );
}
