import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { filterRemoteHostProjects, listRemoteHostProjects, type RemoteHostNextAction } from "@/lib/remote/host-projects";
import { useProjectStore } from "@/stores/project-store";
import { useWorkbenchStore } from "@/stores/workbench-store";
import { useRemoteStore } from "@/stores/remote-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { WORKSPACE_REMOTE_FEATURE } from "@shared/remote";
import {
  AppMenuItem,
  AppMenuLabel,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
  appMenuInputClass,
} from "@/components/ui/app-menu";
import { FolderIcon, FolderOpen, FolderPlus, TerminalIcon } from "lucide-react";

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

const recentRowClass = cn(
  sidebarItemClass,
  "h-auto min-h-0 items-start py-1.5",
);

const hostSubmenuClass = cn(
  "flex min-h-0 min-w-[16rem] w-max flex-col gap-0 overflow-hidden p-0",
  "max-w-[min(22rem,var(--radix-dropdown-menu-content-available-width))]",
  "max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]",
);

function hostMatchesQuery(alias: string, hostname: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return alias.toLowerCase().includes(q) || hostname.toLowerCase().includes(q);
}

export function RemoteHostsMenuSection({
  query,
  visible,
  onRequest,
}: {
  query: string;
  visible: boolean;
  onRequest: (alias: string, next: RemoteHostNextAction) => void;
}) {
  const { t } = useTranslation();
  const entitled = useProLicenseStore((s) => s.hasFeature(WORKSPACE_REMOTE_FEATURE));
  const hosts = useRemoteStore((s) => s.hosts);
  const byProfileId = useRemoteStore((s) => s.byProfileId);
  const hydrate = useRemoteStore((s) => s.hydrate);
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const members = useWorkbenchStore((s) => s.members);
  const [hostQuery, setHostQuery] = useState("");

  useEffect(() => {
    if (visible) void hydrate();
  }, [hydrate, visible]);

  const filtered = useMemo(
    () => hosts.filter((host) => hostMatchesQuery(host.alias, host.hostname, query)),
    [hosts, query],
  );

  return (
    <>
      <AppMenuLabel className="normal-case tracking-normal">
        {t("nav.workbench.remote")}
      </AppMenuLabel>
      {!entitled ? (
        <p className="px-2 py-1.5 text-muted-foreground">{t("remote.upgrade")}</p>
      ) : filtered.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground">{t("nav.workbench.noSshHosts")}</p>
      ) : (
        filtered.map((host) => {
          const state = byProfileId[host.alias];
          const ready = state?.phase === "ready";
          const projects = filterRemoteHostProjects(
            listRemoteHostProjects(host.alias, recentProjects, members),
            hostQuery,
          );
          const description = state?.phase === "ready"
            ? t("remote.phase.ready")
            : state?.phase === "error"
              ? t("remote.phase.error")
              : state?.phase === "connecting" || state?.phase === "bootstrapping"
                ? t("remote.phase.connecting")
                : host.hostname === host.alias
                  ? undefined
                  : host.hostname;
          return (
            <AppMenuSub key={host.alias}>
              <AppMenuSubTrigger
                className={recentRowClass}
                leading={<TerminalIcon className="mt-0.5 size-3.5 shrink-0 opacity-70" />}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{host.alias}</span>
                  {description ? (
                    <span className="truncate text-[length:var(--font-path)] text-muted-foreground">
                      {description}
                    </span>
                  ) : null}
                </span>
              </AppMenuSubTrigger>
              <AppMenuSubContent className={hostSubmenuClass}>
                <div className="shrink-0 border-b border-border px-2 pt-1.5 pb-1.5">
                  <input
                    type="text"
                    value={hostQuery}
                    onChange={(event) => setHostQuery(event.target.value)}
                    placeholder={t("remote.searchHost", { host: host.alias })}
                    aria-label={t("remote.searchHost", { host: host.alias })}
                    className={cn(
                      appMenuInputClass,
                      "h-6 w-full min-w-0 px-0.5",
                      "placeholder:text-muted-foreground/40",
                      "caret-foreground",
                    )}
                    onKeyDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0.5 pb-0.5">
                  {ready ? null : (
                    <AppMenuItem
                      className={sidebarItemClass}
                      onClick={() => onRequest(host.alias, { type: "idle" })}
                    >
                      {state?.phase === "error" ? t("remote.retry") : t("remote.connect")}
                    </AppMenuItem>
                  )}
                  {projects.length === 0 ? (
                    <p className="px-2 py-1.5 text-muted-foreground">
                      {t("remote.noRemoteProjects")}
                    </p>
                  ) : (
                    projects.map((item) => (
                      <AppMenuItem
                        key={item.lastPath}
                        className={recentRowClass}
                        leading={<FolderIcon className="mt-0.5 size-3.5 shrink-0 opacity-70" />}
                        description={item.remoteRoot}
                        onClick={() => onRequest(host.alias, {
                          type: "open-path",
                          remoteRoot: item.remoteRoot,
                        })}
                      >
                        {item.name}
                      </AppMenuItem>
                    ))
                  )}
                </div>
                <div className="shrink-0 bg-popover px-0.5 pt-0.5 pb-0.5">
                  <AppMenuItem
                    className={sidebarItemClass}
                    leading={<FolderOpen className="size-3.5 shrink-0 opacity-70" />}
                    onClick={() => onRequest(host.alias, { type: "open-folder" })}
                  >
                    {t("remote.openFolder")}
                  </AppMenuItem>
                  <AppMenuItem
                    className={sidebarItemClass}
                    leading={<FolderPlus className="size-3.5 shrink-0 opacity-70" />}
                    onClick={() => onRequest(host.alias, { type: "create" })}
                  >
                    {t("remote.newProject")}
                  </AppMenuItem>
                </div>
              </AppMenuSubContent>
            </AppMenuSub>
          );
        })
      )}
    </>
  );
}
