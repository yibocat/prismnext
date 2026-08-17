import { useState, useEffect, useMemo, type DragEvent } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCompileStore } from "@/stores/compile-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { NewProjectPane } from "./new-project-dialog";
import { formatRelativeTimeMs } from "@/lib/chat/relative-time";
import { loadProjectIcon, ProjectIconBadge } from "./project-icon";
import type { IconSpec } from "@shared/icon-spec";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import {
  mapUpdaterStatus,
  type UpdateUiStatus,
} from "@/lib/updates/map-updater-status";
import { requestUpdateInstall } from "@/lib/updates/request-update-install";
import type { UpdaterStatus } from "@/types/electron";
import {
  FolderOpenIcon,
  FolderPlusIcon,
  XIcon,
  ArrowLeftIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  EllipsisIcon,
  GitBranchIcon,
  CheckIcon,
  Loader2Icon,
  SearchIcon,
  ArrowRightIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { WindowControls } from "@/components/layout/window-controls";
import { PrismRibbonMark } from "@/components/brand/prism-ribbon-mark";
import { ChatHomeBackdrop } from "@/components/modules/chat/chat-home-backdrop";

function shortenPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const unix = normalized.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  if (unix) return `~${unix[1] || ""}`;
  const win = normalized.match(/^[A-Za-z]:\/Users\/[^/]+(\/.*)?$/i);
  if (win) return `~${win[1] || ""}`;
  return normalized;
}

function dirnameOf(absPath: string): string {
  const trimmed = absPath.replace(/[/\\]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx <= 0) return trimmed;
  return trimmed.slice(0, idx);
}

function droppedAbsolutePaths(dt: DataTransfer | null): string[] {
  if (!dt?.files?.length) return [];
  const paths: string[] = [];
  for (const file of Array.from(dt.files)) {
    const p = window.electronAPI?.getPathForFile?.(file);
    if (typeof p === "string" && p.trim()) paths.push(p);
  }
  return paths;
}

async function resolveDroppedProjectRoot(raw: string): Promise<string | null> {
  const st = await window.electronAPI?.fsStat?.(raw);
  if (!st) return null;
  if (st.isDirectory) return raw;
  if (st.isFile) return dirnameOf(raw) || null;
  return null;
}

function formatLastOpened(ts: number, locale: string, now = Date.now()): string {
  if (!ts) return "";
  const dayMs = 24 * 60 * 60 * 1000;
  if (now - ts < 7 * dayMs) return formatRelativeTimeMs(ts, now);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(ts);
}

// ─── Startup status checks ───

type CheckState = "loading" | "ok" | "warn" | "error";
type WelcomeView = "recent" | "new-project" | "open-project";

interface StatusItem {
  id: string;
  label: string;
  detail?: string;
  state: CheckState;
}

function StatusIndicator({ state }: { state: CheckState }) {
  if (state === "loading") {
    return <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (state === "ok") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
        <CheckIcon className="size-2.5 stroke-[3]" />
      </span>
    );
  }
  if (state === "warn") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground font-bold text-[10px]">
        !
      </span>
    );
  }
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
      <XIcon className="size-2.5 stroke-[3]" />
    </span>
  );
}

function WelcomeRuntimeStatus() {
  const { t } = useTranslation();
  const detectCompilers = useCompileStore((s) => s.detectCompilers);
  const compilerStatus = useCompileStore((s) => s.compilerStatus);
  const [items, setItems] = useState<StatusItem[]>([
    { id: "app", label: "PrismNext", state: "loading" },
    { id: "agent", label: "OpenCode Agent", state: "loading" },
    { id: "compiler", label: "TeX Compiler", state: "loading" },
  ]);
  const [updateUi, setUpdateUi] = useState<UpdateUiStatus>({ kind: "idle" });
  const [updateBusy, setUpdateBusy] = useState(false);

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === "app") return { ...item, label: t("welcome.status.app") };
        if (item.id === "agent") return { ...item, label: t("welcome.status.agent") };
        if (item.id === "compiler") return { ...item, label: t("welcome.status.compiler") };
        return item;
      }),
    );
  }, [t]);

  useEffect(() => {
    const unsubProgress = window.electronAPI?.onUpdateProgress?.(({ percent }) => {
      setUpdateUi((prev) => {
        if (
          prev.kind !== "downloading" &&
          prev.kind !== "available" &&
          prev.kind !== "downloaded"
        ) {
          return prev;
        }
        return {
          kind: "downloading",
          currentVersion: prev.currentVersion,
          latestVersion: "latestVersion" in prev ? prev.latestVersion : undefined,
          percent,
          downloadPath: "downloadPath" in prev ? prev.downloadPath : undefined,
        };
      });
    });
    const unsubChanged = window.electronAPI?.onUpdateChanged?.((raw) => {
      setUpdateUi(mapUpdaterStatus(raw as UpdaterStatus));
    });
    return () => {
      unsubProgress?.();
      unsubChanged?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyAppUpdate = (
      appVersion: string,
      update: { status: string; latestVersion?: string } | null,
    ) => {
      let appState: CheckState = "ok";
      let appDetail = `v${appVersion}`;
      if (
        update?.status === "available" ||
        update?.status === "downloaded" ||
        update?.status === "downloading"
      ) {
        appState = "warn";
        const latest = update.latestVersion?.trim();
        appDetail = latest ? `v${appVersion} → ${latest}` : `v${appVersion}↑`;
      } else if (
        update?.status === "up-to-date" ||
        update?.status === "no-source" ||
        update?.status === "idle" ||
        update?.status === "ignored" ||
        !update
      ) {
        appDetail = `v${appVersion}`;
      } else if (update?.status === "error") {
        appState = "warn";
        appDetail = `v${appVersion}`;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === "app"
            ? {
                ...item,
                state: appState,
                detail: appDetail,
                label: t("welcome.status.app"),
              }
            : item,
        ),
      );
    };

    const run = async () => {
      void detectCompilers();

      const [versions, agentStatus, cachedUpdate] = await Promise.all([
        window.electronAPI?.aboutGetVersions?.().catch(() => null),
        window.electronAPI?.agentStatus?.().catch(() => null),
        window.electronAPI?.updateStatus?.().catch(() => null),
      ]);

      if (cancelled) return;

      const appVersion = versions?.appVersion?.trim() || "—";
      applyAppUpdate(appVersion, cachedUpdate);
      setUpdateUi(mapUpdaterStatus(cachedUpdate));

      const agentAvailable = Boolean(agentStatus?.ready && agentStatus?.canEmbed);

      setItems((prev) =>
        prev.map((item) =>
          item.id === "agent"
            ? {
                ...item,
                label: t("welcome.status.agent"),
                state:
                  agentStatus && !agentStatus.hasApiKey
                    ? "warn"
                    : agentAvailable
                      ? "ok"
                      : "error",
                detail:
                  agentAvailable
                    ? t("welcome.status.agentReady")
                    : agentStatus?.reason || t("welcome.status.agentMissing"),
              }
            : item,
        ),
      );

      try {
        const fresh = await window.electronAPI?.updateCheck?.();
        if (cancelled) return;
        applyAppUpdate(appVersion, fresh);
        setUpdateUi(mapUpdaterStatus(fresh));
      } catch {
        /* keep cached / version-only */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [detectCompilers, t]);

  useEffect(() => {
    if (!compilerStatus) return;
    const ready = Boolean(compilerStatus.tectonic || compilerStatus.texlive.available);
    const detail = compilerStatus.tectonic
      ? "Tectonic"
      : compilerStatus.texlive.available
        ? compilerStatus.texlive.engines?.[0] || "TeXLive"
        : t("welcome.status.compilerMissing");
    setItems((prev) =>
      prev.map((item) =>
        item.id === "compiler"
          ? {
              ...item,
              label: t("welcome.status.compiler"),
              state: ready ? "ok" : "warn",
              detail,
            }
          : item,
      ),
    );
  }, [compilerStatus, t]);

  const onOneClickUpdate = async () => {
    setUpdateBusy(true);
    try {
      const current = await window.electronAPI.updateStatus();
      let result = current;
      if (current.status !== "downloaded") {
        setUpdateUi((prev) => ({
          kind: "downloading",
          currentVersion:
            "currentVersion" in prev ? prev.currentVersion : current.currentVersion,
          latestVersion:
            ("latestVersion" in prev ? prev.latestVersion : undefined) ??
            current.latestVersion,
          percent: 0,
          downloadPath:
            ("downloadPath" in prev ? prev.downloadPath : undefined) ??
            current.latest?.path,
        }));
        result = await window.electronAPI.updateDownload();
        setUpdateUi(mapUpdaterStatus(result));
      }
      if (result.status !== "downloaded") {
        setUpdateBusy(false);
        return;
      }
      const install = await requestUpdateInstall();
      if (!install.ok) {
        setUpdateBusy(false);
        setUpdateUi({
          kind: "error",
          message:
            install.error === "install-did-not-restart"
              ? t("settings.about.installDidNotRestart")
              : install.error,
        });
      }
    } catch (err) {
      setUpdateBusy(false);
      setUpdateUi({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const appUpdateClickable =
    updateUi.kind === "available" ||
    updateUi.kind === "downloading" ||
    updateUi.kind === "downloaded";

  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center gap-1.5 text-[length:var(--font-size-11)] font-medium text-muted-foreground">
        <ShieldCheckIcon className="size-3.5" />
        <span>{t("welcome.status.cardTitle")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[length:var(--font-size-11)]">
        {items.map((item) => {
          const isAppUpdate = item.id === "app" && appUpdateClickable;
          return (
            <span key={item.id} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <StatusIndicator state={item.state} />
              <span className="font-medium text-foreground">{item.label}</span>
              {item.detail ? <span>{item.detail}</span> : null}
              {isAppUpdate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={updateBusy || updateUi.kind === "downloading"}
                  onClick={() => void onOneClickUpdate()}
                  className="h-5 gap-1 px-1.5"
                >
                  {updateBusy || updateUi.kind === "downloading" ? (
                    <Loader2Icon className="size-2.5 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-2.5" />
                  )}
                  {updateUi.kind === "downloading"
                    ? t("welcome.status.updateDownloading", {
                        version: "latestVersion" in updateUi ? updateUi.latestVersion : "",
                        percent: "percent" in updateUi ? updateUi.percent : 0,
                      })
                    : t("welcome.status.updateAction")}
                </Button>
              ) : null}
            </span>
          );
        })}
      </div>
      <WelcomeProStatus />
    </div>
  );
}

function WelcomeProStatus() {
  const { t } = useTranslation();
  const license = useProLicenseStore((s) => s.license);
  const hydrated = useProLicenseStore((s) => s.hydrated);
  const refresh = useProLicenseStore((s) => s.refresh);
  const activate = useProLicenseStore((s) => s.activate);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = license?.plan === "pro";
  const state: CheckState = !hydrated ? "loading" : active ? "ok" : "warn";

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await activate(draft);
      if (!result.ok) {
        setError(
          result.error === "empty"
            ? t("settings.about.proKeyEmpty")
            : t("settings.about.proKeyInvalid"),
        );
        return;
      }
      setDraft("");
      setExpanded(false);
    } catch {
      setError(t("settings.about.proActivateFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <span className="inline-flex flex-wrap items-center gap-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
        <StatusIndicator state={state} />
        <span className="font-medium text-foreground">{t("welcome.status.pro")}</span>
        <span>
          {active ? t("welcome.status.proActive") : t("welcome.status.proInactive")}
        </span>
        {!active && hydrated && !expanded ? (
          <button
            type="button"
            className="text-foreground transition-colors hover:underline"
            onClick={() => {
              setExpanded(true);
              setError(null);
            }}
          >
            {t("settings.about.proActivate")}
          </button>
        ) : null}
      </span>
      {expanded && !active ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("settings.about.proKeyPlaceholder")}
              className="h-6 px-2 font-mono text-[length:var(--font-size-11)] shadow-none md:text-[length:var(--font-size-11)]"
              autoComplete="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSubmit();
                if (e.key === "Escape") {
                  setExpanded(false);
                  setError(null);
                }
              }}
            />
            <Button
              type="button"
              variant="default"
              size="xs"
              className="h-6 shrink-0"
              disabled={busy || !draft.trim()}
              onClick={() => void onSubmit()}
            >
              {busy ? <Loader2Icon className="size-3 animate-spin" /> : null}
              {t("settings.about.proActivate")}
            </Button>
          </div>
          {error ? (
            <p className="text-[length:var(--font-size-11)] text-destructive">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Recent Projects ───

interface RecentRow {
  path: string;
  name: string;
  lastOpened: number;
  exists: boolean;
  isGit: boolean | null;
  branch: string | null;
  projectIcon: IconSpec | null;
}

async function loadRecentRow(
  path: string,
  name: string,
  lastOpened: number,
): Promise<RecentRow> {
  try {
    const exists = await window.electronAPI?.fsExists?.(path);
    if (!exists) {
      return { path, name, lastOpened, exists: false, isGit: null, branch: null, projectIcon: null };
    }

    const [isGit, projectIcon] = await Promise.all([
      window.electronAPI?.gitIsRepo?.(path).catch(() => false) ?? false,
      loadProjectIcon(path),
    ]);

    let branch: string | null = null;
    if (isGit) {
      try {
        const branches = await window.electronAPI?.gitBranches?.(path);
        branch = branches?.current || null;
      } catch {
        branch = null;
      }
    }

    return { path, name, lastOpened, exists: true, isGit, branch, projectIcon };
  } catch {
    return { path, name, lastOpened, exists: false, isGit: null, branch: null, projectIcon: null };
  }
}

function RecentProjectsList({
  projectOpen,
  filterQuery,
}: {
  projectOpen: (path: string) => Promise<boolean>;
  filterQuery: string;
}) {
  const { t, i18n } = useTranslation();
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);
  const [rows, setRows] = useState<RecentRow[]>(() =>
    recentProjects.map((p) => ({
      path: p.path,
      name: p.name,
      lastOpened: p.lastOpened,
      exists: true,
      isGit: null,
      branch: null,
      projectIcon: null,
    })),
  );

  useEffect(() => {
    let cancelled = false;
    setRows(
      recentProjects.map((p) => ({
        path: p.path,
        name: p.name,
        lastOpened: p.lastOpened,
        exists: true,
        isGit: null,
        branch: null,
        projectIcon: null,
      })),
    );
    const load = async () => {
      const results = await Promise.all(
        recentProjects.map((p) => loadRecentRow(p.path, p.name, p.lastOpened)),
      );
      if (!cancelled) setRows(results);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [recentProjects]);

  const filteredRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        (r.branch && r.branch.toLowerCase().includes(q)),
    );
  }, [rows, filterQuery]);

  const handleRevealInFinder = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    void window.electronAPI?.shellShowItemInFolder?.(path);
  };

  if (recentProjects.length === 0) {
    return (
      <div className="py-8">
        <p className="text-[length:var(--font-size-13)] font-medium text-foreground">
          {t("welcome.emptyRecent")}
        </p>
        <p className="mt-1 text-[length:var(--font-size-12)] text-muted-foreground">
          {t("welcome.emptyRecentDesc")}
        </p>
      </div>
    );
  }

  if (filteredRows.length === 0) {
    return (
      <div className="py-8 text-[length:var(--font-size-12)] text-muted-foreground">
        {t("welcome.noMatchingProjects")}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {filteredRows.map((p) => {
        const pathLabel = p.exists ? shortenPath(p.path) : t("welcome.missingOnDisk");
        const openedLabel = formatLastOpened(p.lastOpened, i18n.language);

        return (
          <div
            key={p.path}
            className={cn(
              "group flex items-center gap-2.5 py-2.5",
              p.exists ? "cursor-pointer" : "opacity-50",
            )}
            onClick={async () => {
              if (!p.exists) return;
              const ok = await projectOpen(p.path);
              if (!ok) return;
              addRecentProject(p.path);
              await openProject(p.path);
            }}
          >
            <div className="relative size-7 shrink-0">
              <ProjectIconBadge
                icon={p.projectIcon}
                name={p.name}
                projectPath={p.path}
                muted={!p.exists}
                className={p.exists ? "group-hover:invisible" : undefined}
              />
              {p.exists ? (
                <Hint label={t("welcome.revealInFolder")}>
                  <button
                    type="button"
                    className="absolute inset-0 hidden items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex"
                    onClick={(e) => handleRevealInFinder(e, p.path)}
                  >
                    <ExternalLinkIcon className="size-3.5" />
                  </button>
                </Hint>
              ) : null}
            </div>
            <span className="min-w-0 max-w-[16rem] shrink truncate text-[length:var(--font-size-13)] font-medium text-foreground">
              {p.name}
            </span>
            {p.exists && p.isGit ? (
              <span
                className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 text-[length:var(--font-size-10)] font-medium text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground"
                title={
                  p.branch
                    ? t("welcome.gitBranch", { branch: p.branch })
                    : t("welcome.gitRepo")
                }
              >
                <GitBranchIcon className="size-2.5" />
                <span className="max-w-[5.5rem] truncate">{p.branch || "Git"}</span>
              </span>
            ) : p.exists && p.isGit === false ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-muted px-1.5 text-[length:var(--font-size-10)] font-medium text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground">
                {t("common.noGit")}
              </span>
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-mono text-[length:var(--font-size-11)] transition-colors",
                p.exists
                  ? "text-muted-foreground group-hover:text-foreground"
                  : "text-destructive",
              )}
            >
              {pathLabel}
            </span>
            <div className="relative flex h-6 shrink-0 items-center justify-end">
              {openedLabel ? (
                <span className="whitespace-nowrap text-right text-[length:var(--font-size-11)] tabular-nums text-muted-foreground group-hover:invisible">
                  {openedLabel}
                </span>
              ) : (
                <span className="size-6" aria-hidden />
              )}
              <Hint label={t("welcome.removeRecent")}>
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 my-auto hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentProject(p.path);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </Hint>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WelcomeBackHeader({
  title,
  description,
  onBack,
}: {
  title: string;
  description?: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex items-start gap-2">
      <Hint label={t("common.back")}>
        <button
          type="button"
          aria-label={t("common.back")}
          className="mt-[-2px] flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-4" />
        </button>
      </Hint>
      <div className="min-w-0 space-y-1">
        <h2 className="text-[length:var(--font-size-14)] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WelcomeOpenExisting({
  onPickFolder,
  onOpenPath,
}: {
  onPickFolder: () => void;
  onOpenPath: (path: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const [opening, setOpening] = useState(false);

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const raw = droppedAbsolutePaths(e.dataTransfer)[0];
    if (!raw || opening) return;
    const root = await resolveDroppedProjectRoot(raw);
    if (!root) return;
    setOpening(true);
    try {
      await onOpenPath(root);
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center transition-colors",
        dragOver ? "border-primary bg-muted" : "border-border bg-card",
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted text-foreground">
        <FolderOpenIcon className="size-5" />
      </div>
      <p className="mt-4 max-w-sm text-[length:var(--font-size-12)] leading-relaxed text-muted-foreground">
        {dragOver ? t("welcome.openDropActive") : t("welcome.openExistingDesc")}
      </p>
      <p className="mt-1 text-[length:var(--font-size-11)] text-muted-foreground">
        {t("welcome.openDropHint")}
      </p>
      <Button
        type="button"
        size="sm"
        className="mt-4 gap-1.5"
        disabled={opening}
        onClick={onPickFolder}
      >
        <FolderOpenIcon className="size-3.5" />
        {t("welcome.open")}
      </Button>
    </div>
  );
}

// ─── Welcome Page ───

export function WelcomePage({ onSkip }: { onSkip?: () => void }) {
  const { t } = useTranslation();
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);
  const projectOpen = useProjectOpen();
  const recentCount = useProjectStore((s) => s.recentProjects.length);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [filterQuery, setFilterQuery] = useState("");
  const [activeView, setActiveView] = useState<WelcomeView>("recent");

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const openProjectAt = async (path: string) => {
    const ok = await projectOpen(path);
    if (!ok) return;
    addRecentProject(path);
    await openProject(path);
  };

  const handleOpen = async () => {
    const result = await window.electronAPI?.dialogOpenFolder?.();
    if (!result || result.canceled || !result.path) return;
    await openProjectAt(result.path);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background select-none">
      <ChatHomeBackdrop />
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
      {/* ── Top Drag Titlebar ── */}
      <div
        className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center justify-end gap-1 px-3"
        style={{ transform: "translateZ(0)" }}
      >
        <Hint label={t("common.theme", { theme })}>
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={cycleTheme}
          >
            {theme === "system" ? (
              <MonitorIcon className="size-4" />
            ) : resolvedTheme === "dark" ? (
              <SunIcon className="size-4" />
            ) : (
              <MoonIcon className="size-4" />
            )}
          </button>
        </Hint>
        <Hint label={t("common.settings")} shortcutId="shell.openSettings">
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => {
              useDocumentStore.getState().setShowWelcome(false);
              useLayoutStore.getState().setLeftSidebarView("settings");
            }}
          >
            <EllipsisIcon className="size-4" />
          </button>
        </Hint>

        <WindowControls />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-8 px-6 py-6 lg:h-full lg:min-h-0 lg:flex-row lg:gap-12 lg:py-10">
          <aside className="flex shrink-0 flex-col gap-5 lg:w-[21rem] lg:overflow-y-auto">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card p-2.5 shadow-sm">
                    <PrismRibbonMark className="size-8" palette="p5" scheme="auto" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                      {t("welcome.brand")}
                    </h1>
                    <p className="text-[length:var(--font-size-12)] font-medium text-muted-foreground">
                      {t("welcome.tagline")}
                    </p>
                  </div>
                </div>
                <p className="text-[length:var(--font-size-12)] leading-relaxed text-muted-foreground">
                  {t("welcome.intro")}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView("new-project")}
                  className={cn(
                    "group relative flex items-center justify-between rounded-xl border p-4 text-left transition-colors",
                    activeView === "new-project"
                      ? "border-primary bg-card"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <FolderPlusIcon className="size-5" />
                    </div>
                    <div>
                      <div className="text-[length:var(--font-size-14)] font-semibold text-foreground">
                        {t("welcome.newProject")}
                      </div>
                      <div className="text-[length:var(--font-size-11)] text-muted-foreground">
                        {t("welcome.newProjectDesc")}
                      </div>
                    </div>
                  </div>
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView("open-project")}
                  className={cn(
                    "group relative flex items-center justify-between rounded-xl border p-4 text-left transition-colors",
                    activeView === "open-project"
                      ? "border-primary bg-card"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                      <FolderOpenIcon className="size-5" />
                    </div>
                    <div>
                      <div className="text-[length:var(--font-size-14)] font-semibold text-foreground">
                        {t("welcome.openExisting")}
                      </div>
                      <div className="text-[length:var(--font-size-11)] text-muted-foreground">
                        {t("welcome.openExistingDesc")}
                      </div>
                    </div>
                  </div>
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              <WelcomeRuntimeStatus />

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd className="text-[10px]">⌘K</Kbd>
                    <span>{t("welcome.shortcuts.palette")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd className="text-[10px]">⌘,</Kbd>
                    <span>{t("welcome.shortcuts.settings")}</span>
                  </span>
                </div>

                {onSkip ? (
                  <button
                    type="button"
                    className="text-muted-foreground transition-colors hover:text-foreground hover:underline"
                    onClick={onSkip}
                  >
                    {t("common.skipForNow")}
                  </button>
                ) : null}
              </div>
            </aside>

            <section className="min-h-0 min-w-0 flex-1 lg:overflow-y-auto lg:pr-1">
              {activeView === "recent" ? (
                <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[length:var(--font-size-14)] font-semibold tracking-tight text-foreground">
                    {t("welcome.recentProjects")}
                  </span>
                  {recentCount > 0 ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[length:var(--font-size-10)] font-medium text-muted-foreground">
                      {recentCount}
                    </span>
                  ) : null}
                </div>

                {recentCount > 3 ? (
                  <div className="relative min-w-0 flex-1">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-7 w-full pl-8 text-[length:var(--font-size-11)]"
                      placeholder={t("welcome.filterPlaceholder")}
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                    />
                    {filterQuery ? (
                      <button
                        type="button"
                        onClick={() => setFilterQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <XIcon className="size-3" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <RecentProjectsList
                projectOpen={projectOpen}
                filterQuery={filterQuery}
              />
                </div>
              ) : null}

              {activeView === "new-project" ? (
                <div>
                  <WelcomeBackHeader
                    title={t("project.new.title")}
                    description={t("project.new.description")}
                    onBack={() => setActiveView("recent")}
                  />
                  <NewProjectPane
                    embedded
                    hideTitle
                    onCancel={() => setActiveView("recent")}
                    onCreated={() => setActiveView("recent")}
                  />
                </div>
              ) : null}

              {activeView === "open-project" ? (
                <div>
                  <WelcomeBackHeader
                    title={t("welcome.openExisting")}
                    onBack={() => setActiveView("recent")}
                  />
                  <WelcomeOpenExisting
                    onPickFolder={() => void handleOpen()}
                    onOpenPath={openProjectAt}
                  />
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
      </div>
  );
}

