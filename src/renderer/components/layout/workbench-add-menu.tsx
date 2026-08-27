import { useMemo, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { i18n } from "@/lib/i18n";
import { applyProjectPick } from "@/lib/workspace/project-context";
import {
  JOINABLE_RECENT_PREVIEW_COUNT,
  pickAndJoinWorkbenchFolder,
} from "@/lib/workspace/project-lifecycle";
import {
  listUnifiedRecents,
  visibleUnifiedRecents,
} from "@/lib/workspace/unified-project-picker";
import { encodeRemoteAbs, parseRemoteAbs } from "@shared/remote";
import type { RemoteHostNextAction } from "@/lib/remote/host-projects";
import { useProjectStore } from "@/stores/project-store";
import { defaultProjectAsMember, useWorkbenchStore } from "@/stores/workbench-store";
import { useRemoteStore } from "@/stores/remote-store";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuTrigger,
  appMenuInputClass,
} from "@/components/ui/app-menu";
import {
  LEFT_SIDEBAR_SECTION_ACTION,
  LEFT_SIDEBAR_SECTION_ACTION_ICON,
} from "@/components/layout/left-nav-button";
import { NewProjectDialog } from "@/components/modules/project/new-project-dialog";
import { ProjectPickerReposSection } from "@/components/modules/project/project-picker-repos";
import { RemoteConnectDialog } from "@/components/modules/remote/remote-connect-dialog";
import { RemoteFolderDialog } from "@/components/modules/remote/remote-folder-dialog";
import { SshHostPickerDialog } from "@/components/modules/remote/ssh-host-picker-dialog";
import { Hint } from "@/components/ui/hint";
import { FolderIcon, FolderOpen, FolderPlus, PlugIcon } from "lucide-react";

const sidebarItemClass =
  "focus:bg-sidebar-accent focus:text-sidebar-accent-foreground";

const recentRowClass = cn(
  sidebarItemClass,
  "h-auto min-h-0 items-start py-1.5",
);

const pickerPanelClass = cn(
  "flex min-h-0 min-w-[12rem] w-max flex-col gap-0 overflow-hidden p-0",
  "max-w-[min(26rem,var(--radix-dropdown-menu-content-available-width))]",
  "max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))]",
);

async function openRemoteViaContext(alias: string, remoteRoot: string): Promise<void> {
  const path = encodeRemoteAbs(alias, remoteRoot);
  if (!path) throw new Error("invalid_remote_path");
  const result = await applyProjectPick({ path, mode: "focus" });
  if (!result.ok) throw new Error(result.reason);
  const name = remoteRoot.split("/").filter(Boolean).at(-1) || remoteRoot;
  toast.success(i18n.t("remote.openedProject", { name }));
}

export function WorkbenchProjectPicker({
  children,
  hintLabel,
  disabled,
  pickerMode,
  onPickPath,
  onOpenFolder,
  onProjectCreated,
}: {
  children: ReactElement;
  hintLabel: string;
  disabled?: boolean;
  pickerMode: "workbench-add" | "chat-assign";
  onPickPath: (path: string) => void;
  onOpenFolder: () => void;
  onProjectCreated?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const newProjectTriggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [connect, setConnect] = useState<{ alias: string; next: RemoteHostNextAction } | null>(null);
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const [folder, setFolder] = useState<{ alias: string } | null>(null);
  const [remoteNew, setRemoteNew] = useState<{ profileId: string } | null>(null);
  const [sshPickerOpen, setSshPickerOpen] = useState(false);

  const recentProjects = useProjectStore((s) => s.recentProjects);
  const members = useWorkbenchStore((s) => s.members);
  const defaultMember = useWorkbenchStore((s) => defaultProjectAsMember(s));
  const memberPaths = useMemo(() => members.map((member) => member.lastPath), [members]);

  const filtered = useMemo(
    () => listUnifiedRecents({
      recentProjects,
      memberPaths,
      defaultProject: defaultMember
        ? { path: defaultMember.lastPath, name: defaultMember.displayName }
        : null,
      query,
    }),
    [recentProjects, memberPaths, query, defaultMember],
  );
  const searching = query.trim().length > 0;
  const { items, remaining } = visibleUnifiedRecents(filtered, {
    expanded: expanded || searching,
    previewCount: JOINABLE_RECENT_PREVIEW_COUNT,
  });

  const handleOpenChange = (next: boolean) => {
    if (disabled && next) return;
    setOpen(next);
    if (!next) {
      setQuery("");
      setExpanded(false);
    }
  };

  const requestRemote = (alias: string, next: RemoteHostNextAction) => {
    setOpen(false);
    const ready = useRemoteStore.getState().byProfileId[alias]?.phase === "ready";
    if (ready && next.type === "open-path") {
      void openRemoteViaContext(alias, next.remoteRoot).catch((err) => {
        toast.error(err instanceof Error ? err.message : t("remote.phase.error"));
      });
      return;
    }
    if (ready && next.type === "open-folder") {
      setFolder({ alias });
      return;
    }
    if (ready && next.type === "create") {
      setRemoteNew({ profileId: alias });
      return;
    }
    if (ready && next.type === "idle") return;
    setConnect({ alias, next });
  };

  const afterConnectReady = () => {
    const pending = connectRef.current;
    setConnect(null);
    if (!pending) return;
    if (pending.next.type === "open-path") {
      void openRemoteViaContext(pending.alias, pending.next.remoteRoot).catch((err) => {
        toast.error(err instanceof Error ? err.message : t("remote.phase.error"));
      });
      return;
    }
    if (pending.next.type === "open-folder") {
      setFolder({ alias: pending.alias });
      return;
    }
    if (pending.next.type === "create") {
      setRemoteNew({ profileId: pending.alias });
    }
  };

  return (
    <>
      <AppMenu open={open} onOpenChange={handleOpenChange}>
        <Hint label={hintLabel}>
          <AppMenuTrigger asChild disabled={disabled}>
            {children}
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent
          side="bottom"
          align="start"
          collisionPadding={16}
          className={pickerPanelClass}
          data-picker-mode={pickerMode}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <div className="shrink-0 border-b border-border px-2 pt-1.5 pb-1.5">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("nav.workbench.searchProjects")}
              aria-label={t("nav.workbench.searchProjects")}
              className={cn(
                appMenuInputClass,
                "h-6 w-full min-w-0 px-0.5",
                "placeholder:text-muted-foreground/40",
                "caret-foreground",
              )}
              onKeyDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-0.5 pb-0.5">
            <AppMenuLabel className="normal-case tracking-normal">
              {t("nav.workbench.recents")}
            </AppMenuLabel>
            {items.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground">
                {t("nav.project.noRecent")}
              </p>
            ) : (
              items.map((item) => (
                <AppMenuItem
                  key={item.path}
                  className={cn(
                    recentRowClass,
                    item.onWorkbench && "text-muted-foreground",
                  )}
                  leading={
                    <FolderIcon
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        item.onWorkbench ? "opacity-40" : "opacity-70",
                      )}
                    />
                  }
                  description={item.kind === "local" ? item.description : undefined}
                  title={item.path}
                  titleAddon={
                    item.isDefault ? (
                      <span className="text-[length:var(--font-badge)] text-muted-foreground">
                        {t("nav.workbench.defaultBadge")}
                      </span>
                    ) : null
                  }
                  trailing={
                    item.trailing ? (
                      <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                        {item.trailing}
                      </span>
                    ) : null
                  }
                  onClick={() => onPickPath(item.path)}
                >
                  {item.name}
                </AppMenuItem>
              ))
            )}
            {remaining > 0 ? (
              <AppMenuItem
                className={cn(sidebarItemClass, "text-muted-foreground")}
                onSelect={(event) => {
                  event.preventDefault();
                  setExpanded(true);
                }}
              >
                {t("nav.workbench.more")}
              </AppMenuItem>
            ) : null}
            <AppMenuSeparator />
            <AppMenuLabel className="normal-case tracking-normal">
              {t("nav.workbench.repos")}
            </AppMenuLabel>
            <ProjectPickerReposSection
              query={query}
              visible={open}
              onPickPath={onPickPath}
              onOpenLocalFolder={onOpenFolder}
              onRequest={requestRemote}
            />
          </div>
          <div className="shrink-0 bg-popover px-0.5 pt-0.5 pb-0.5">
            <AppMenuSeparator />
            <AppMenuItem
              className={sidebarItemClass}
              leading={<FolderOpen className="size-3.5 shrink-0 opacity-70" />}
              onClick={onOpenFolder}
            >
              {t("nav.workbench.openFolder")}
            </AppMenuItem>
            <AppMenuItem
              className={sidebarItemClass}
              leading={<FolderPlus className="size-3.5 shrink-0 opacity-70" />}
              onClick={() => newProjectTriggerRef.current?.click()}
            >
              {t("nav.project.newProject")}
            </AppMenuItem>
            <AppMenuItem
              className={sidebarItemClass}
              leading={<PlugIcon className="size-3.5 shrink-0 opacity-70" />}
              onClick={() => setSshPickerOpen(true)}
            >
              {t("nav.workbench.connectSsh")}
            </AppMenuItem>
          </div>
        </AppMenuContent>
      </AppMenu>
      <NewProjectDialog onCreated={onProjectCreated}>
        <button ref={newProjectTriggerRef} type="button" className="hidden" />
      </NewProjectDialog>
      {remoteNew ? (
        <NewProjectDialog
          open
          locationSeed={{ kind: "remote", profileId: remoteNew.profileId }}
          onOpenChange={(next) => {
            if (!next) setRemoteNew(null);
          }}
          onCreated={(path) => {
            setRemoteNew(null);
            onProjectCreated?.(path);
            const name = path.split("/").filter(Boolean).at(-1) || path;
            toast.success(i18n.t("remote.createdProject", { name }));
          }}
        />
      ) : null}
      <RemoteConnectDialog
        alias={connect?.alias ?? null}
        open={Boolean(connect)}
        onOpenChange={(next) => {
          if (!next) setConnect(null);
        }}
        onReady={afterConnectReady}
      />
      <RemoteFolderDialog
        alias={folder?.alias ?? null}
        mode="open"
        open={Boolean(folder)}
        onOpenChange={(next) => {
          if (!next) setFolder(null);
        }}
        onConfirm={async (remoteRoot) => {
          if (!folder) return;
          await openRemoteViaContext(folder.alias, remoteRoot);
        }}
      />
      <SshHostPickerDialog
        open={sshPickerOpen}
        onOpenChange={setSshPickerOpen}
        onSelectHost={(alias) => requestRemote(alias, { type: "idle" })}
      />
    </>
  );
}

/** Header “+” — join a folder to the workbench. Not a current-project switcher. */
export function WorkbenchAddMenu() {
  const { t } = useTranslation();

  return (
    <WorkbenchProjectPicker
      pickerMode="workbench-add"
      hintLabel={t("nav.workbench.addProject")}
      onPickPath={(path) => {
        void applyProjectPick({
          path,
          mode: "focus",
          newSessionAfterFocus: false,
        }).then((result) => {
          if (!result.ok) return;
          const parsed = parseRemoteAbs(path);
          if (!parsed) return;
          const name = parsed.abs.split("/").filter(Boolean).at(-1) || parsed.abs;
          toast.success(i18n.t("remote.openedProject", { name }));
        });
      }}
      onOpenFolder={() => void pickAndJoinWorkbenchFolder()}
    >
      <button
        type="button"
        className={LEFT_SIDEBAR_SECTION_ACTION}
      >
        <FolderPlus className={LEFT_SIDEBAR_SECTION_ACTION_ICON} />
      </button>
    </WorkbenchProjectPicker>
  );
}
