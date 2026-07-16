import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useCompileStore } from "@/stores/compile-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import { NewProjectDialog } from "./new-project-dialog";
import { loadProjectIcon, ProjectIconBadge } from "./project-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UpdateCheckResult } from "@/types/electron";
import {
  FolderOpenIcon,
  FolderPlusIcon,
  XIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  EllipsisIcon,
  GitBranchIcon,
  CheckIcon,
  Loader2Icon,
} from "lucide-react";

function shortenPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const unix = normalized.match(/^\/(?:Users|home)\/[^/]+(\/.*)?$/);
  if (unix) return `~${unix[1] || ""}`;
  const win = normalized.match(/^[A-Za-z]:\/Users\/[^/]+(\/.*)?$/i);
  if (win) return `~${win[1] || ""}`;
  return normalized;
}

function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" · ");
}

import { PrismRibbonMark } from "@/components/brand/prism-ribbon-mark";

function PrismNextMark({ className }: { className?: string }) {
  return <PrismRibbonMark className={className} palette="p5" scheme="auto" />;
}

// ─── Startup status checks ───

type CheckState = "loading" | "ok" | "warn" | "error";

interface StatusItem {
  id: string;
  label: string;
  detail?: string;
  state: CheckState;
}

function StatusDot({ state }: { state: CheckState }) {
  const { t } = useTranslation();
  if (state === "loading") {
    return <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground/50" />;
  }
  if (state === "ok") {
    return (
      <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckIcon className="size-2.5 stroke-[3]" />
      </span>
    );
  }
  if (state === "warn") {
    return <span className="size-3.5 shrink-0 rounded-full bg-amber-500" title={t("common.warning")} />;
  }
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
      <XIcon className="size-2.5 stroke-[3]" />
    </span>
  );
}

function WelcomeStatusChecks() {
  const { t } = useTranslation();
  const detectCompilers = useCompileStore((s) => s.detectCompilers);
  const compilerStatus = useCompileStore((s) => s.compilerStatus);
  const updateSource = useSettingsStore((s) => s.settings.updateSource);
  const [items, setItems] = useState<StatusItem[]>([
    { id: "app", label: "App", state: "loading" },
    { id: "agent", label: "OpenCode", state: "loading" },
    { id: "compiler", label: "Compiler", state: "loading" },
  ]);

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
    let cancelled = false;

    const applyAppUpdate = (
      appVersion: string,
      update: UpdateCheckResult | null,
    ) => {
      let appState: CheckState = "ok";
      let appDetail = `v${appVersion}`;
      if (update?.status === "available") {
        appState = "warn";
        appDetail = `v${appVersion}↑`;
      } else if (update?.status === "up-to-date" || update?.status === "no-source" || !update) {
        appDetail = `v${appVersion}`;
      } else if (update?.status === "error") {
        appState = "warn";
        appDetail = `v${appVersion}`;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === "app"
            ? { ...item, state: appState, detail: appDetail, label: "App" }
            : item,
        ),
      );
    };

    const run = async () => {
      void detectCompilers();

      const [versions, chat, cachedUpdate] = await Promise.all([
        window.electronAPI.aboutGetVersions().catch(() => null),
        window.electronAPI.chatStatus().catch(() => null),
        window.electronAPI.updateStatus().catch(() => null),
      ]);

      if (cancelled) return;

      const appVersion = versions?.appVersion?.trim() || "—";
      applyAppUpdate(appVersion, cachedUpdate);

      const agentAvailable =
        Boolean(chat?.available) || Boolean(versions?.opencode?.available);

      setItems((prev) =>
        prev.map((item) =>
          item.id === "agent"
            ? {
                ...item,
                label: "OpenCode",
                state: agentAvailable ? "ok" : "error",
                detail: agentAvailable ? "ready" : "unavailable",
              }
            : item,
        ),
      );

      if (updateSource?.trim()) {
        try {
          const fresh = await window.electronAPI.updateCheck();
          if (!cancelled) applyAppUpdate(appVersion, fresh);
        } catch {
          /* keep cached / version-only */
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [detectCompilers, updateSource]);

  useEffect(() => {
    if (!compilerStatus) return;
    const ready = Boolean(compilerStatus.tectonic || compilerStatus.texlive.available);
    const detail = compilerStatus.tectonic
      ? "Tectonic"
      : compilerStatus.texlive.available
        ? compilerStatus.texlive.engines?.[0] || "TeXLive"
        : "Not found";
    setItems((prev) =>
      prev.map((item) =>
        item.id === "compiler"
          ? {
              ...item,
              state: ready ? "ok" : "warn",
              detail,
            }
          : item,
      ),
    );
  }, [compilerStatus]);

  const overall: CheckState = items.some((i) => i.state === "loading")
    ? "loading"
    : items.some((i) => i.state === "error")
      ? "error"
      : items.some((i) => i.state === "warn")
        ? "warn"
        : "ok";

  const text = items
    .map((item) => {
      const detail = item.detail?.trim();
      return detail ? `${item.label} ${detail}` : item.label;
    })
    .join(" · ");

  return (
    <div
      className="mt-4 flex w-full items-start justify-start gap-2 text-[length:var(--font-size-11)] text-muted-foreground"
      title={text}
    >
      <StatusDot state={overall} />
      <span className="min-w-0 flex-1 text-left leading-relaxed text-foreground/75">
        {text}
      </span>
    </div>
  );
}

// ─── Recent Projects ───

interface RecentRow {
  path: string;
  name: string;
  exists: boolean;
  isGit: boolean | null;
  branch: string | null;
  projectIcon: string | null;
}

async function loadRecentRow(path: string, name: string): Promise<RecentRow> {
  try {
    const exists = await window.electronAPI.fsExists(path);
    if (!exists) {
      return { path, name, exists: false, isGit: null, branch: null, projectIcon: null };
    }

    const [isGit, projectIcon] = await Promise.all([
      window.electronAPI.gitIsRepo(path).catch(() => false),
      loadProjectIcon(path),
    ]);

    let branch: string | null = null;
    if (isGit) {
      try {
        const branches = await window.electronAPI.gitBranches(path);
        branch = branches.current || null;
      } catch {
        branch = null;
      }
    }

    return { path, name, exists: true, isGit, branch, projectIcon };
  } catch {
    return { path, name, exists: false, isGit: null, branch: null, projectIcon: null };
  }
}

function RecentProjects({ projectOpen }: { projectOpen: (path: string) => Promise<boolean> }) {
  const { t } = useTranslation();
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);
  const [rows, setRows] = useState<RecentRow[]>(() =>
    recentProjects.map((p) => ({
      path: p.path,
      name: p.name,
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
        exists: true,
        isGit: null,
        branch: null,
        projectIcon: null,
      })),
    );
    const load = async () => {
      const results = await Promise.all(
        recentProjects.map((p) => loadRecentRow(p.path, p.name)),
      );
      if (!cancelled) setRows(results);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [recentProjects]);

  if (recentProjects.length === 0) {
    return (
      <p className="px-2 py-5 text-center text-[length:var(--font-size-12)] text-muted-foreground/65">
        {t("welcome.emptyRecent")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {rows.map((p) => {
        const meta = p.exists
          ? joinMeta([
              shortenPath(p.path),
              p.isGit === false ? t("common.noGit") : null,
            ])
          : t("welcome.missingOnDisk");

        return (
          <div
            key={p.path}
            className={cn(
              "group relative flex items-center gap-1 rounded-lg px-2.5 py-2 transition-colors",
              p.exists ? "hover:bg-muted/70" : "opacity-45",
            )}
          >
            {p.exists ? (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                onClick={async () => {
                  const ok = await projectOpen(p.path);
                  if (!ok) return;
                  addRecentProject(p.path);
                  openProject(p.path);
                }}
              >
                <ProjectIconBadge icon={p.projectIcon} name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[length:var(--font-size-13)] font-medium text-foreground">
                      {p.name}
                    </span>
                    {p.isGit ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-px text-[length:var(--font-size-10)] text-muted-foreground"
                        title={
                          p.branch
                            ? t("welcome.gitBranch", { branch: p.branch })
                            : t("welcome.gitRepo")
                        }
                      >
                        <GitBranchIcon className="size-2.5 opacity-70" />
                        <span className="max-w-[5.5rem] truncate">
                          {p.branch || "Git"}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[length:var(--font-size-11)] text-muted-foreground">
                    {meta}
                  </span>
                </span>
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <ProjectIconBadge icon={p.projectIcon} name={p.name} muted />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[length:var(--font-size-13)] font-medium">
                    {p.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[length:var(--font-size-11)]">
                    {meta}
                  </span>
                </span>
              </div>
            )}
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70 hover:bg-background hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                removeRecentProject(p.path);
              }}
              title={t("welcome.removeRecent")}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        );
      })}
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

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const handleOpen = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (result.canceled || !result.path) return;
    const ok = await projectOpen(result.path);
    if (!ok) return;
    addRecentProject(result.path);
    await openProject(result.path);
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div
        className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center justify-end gap-0.5 px-2 select-none"
        style={{ transform: "translateZ(0)" }}
      >
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={t("common.theme", { theme })}
          onClick={cycleTheme}
        >
          {theme === "system" ? (
            <MonitorIcon className="size-3.5" />
          ) : resolvedTheme === "dark" ? (
            <SunIcon className="size-3.5" />
          ) : (
            <MoonIcon className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={t("common.settings")}
          onClick={() => {
            useDocumentStore.getState().setShowWelcome(false);
            useLayoutStore.getState().setLeftSidebarView("settings");
          }}
        >
          <EllipsisIcon className="size-3.5" />
        </button>
      </div>

      {/*
        Safe centering: my-auto inside overflow-y-auto centers when content is short,
        and scrolls from the top when the window is short/narrow (avoids justify-center clipping).
      */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="mx-auto my-auto flex w-full max-w-sm flex-col px-6 py-6 sm:py-8">
          <section className="flex shrink-0 flex-col items-center text-center">
            <div className="mb-2.5 flex flex-col items-center gap-2.5">
              {/* Plate follows UI surface; mark inset so it is not edge-to-edge. */}
              <div className="flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card p-2 shadow-sm">
                <PrismNextMark className="size-7" />
              </div>
              <span className="text-[length:var(--font-size-16)] font-semibold tracking-tight text-foreground">
                {t("welcome.brand")}
              </span>
            </div>

            <WelcomeStatusChecks />

            <div className="mt-6 grid w-full grid-cols-2 gap-2">
              <NewProjectDialog>
                <Button type="button" size="sm" className="h-9 w-full gap-1.5 font-medium">
                  <FolderPlusIcon className="size-3.5 opacity-90" />
                  {t("welcome.newProject")}
                </Button>
              </NewProjectDialog>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-full gap-1.5 font-medium"
                onClick={() => void handleOpen()}
              >
                <FolderOpenIcon className="size-3.5 opacity-80" />
                {t("welcome.open")}
              </Button>
            </div>
          </section>

          <div className="my-5 flex shrink-0 items-center gap-3 sm:my-6" aria-hidden>
            <div className="h-px flex-1 bg-border/80" />
            <span className="text-[length:var(--font-size-11)] font-medium uppercase tracking-wider text-muted-foreground/55">
              {recentCount > 0
                ? t("welcome.recentCount", { count: recentCount })
                : t("welcome.recent")}
            </span>
            <div className="h-px flex-1 bg-border/80" />
          </div>

          <section className="w-full shrink-0">
            <RecentProjects projectOpen={projectOpen} />
          </section>

          {onSkip ? (
            <button
              type="button"
              className="mt-5 shrink-0 self-center text-[length:var(--font-size-12)] text-muted-foreground/45 transition-colors hover:text-muted-foreground sm:mt-6"
              onClick={onSkip}
            >
              {t("common.skipForNow")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
