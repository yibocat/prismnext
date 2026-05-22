import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectOpen } from "@/hooks/use-project-open";
import {
  FolderOpenIcon,
  FolderIcon,
  SparklesIcon,
  Loader2Icon,
  XIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  EllipsisIcon,
} from "lucide-react";

// ─── Recent Projects ───

interface RecentWithStatus {
  path: string;
  name: string;
  exists: boolean;
}

function RecentProjects({ projectOpen }: { projectOpen: (path: string) => Promise<boolean> }) {
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const removeRecentProject = useProjectStore((s) => s.removeRecentProject);
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);
  const [statuses, setStatuses] = useState<RecentWithStatus[]>([]);

  useEffect(() => {
    const check = async () => {
      const results = await Promise.all(
        recentProjects.map(async (p) => {
          try {
            const exists = await window.electronAPI.fsExists(p.path);
            return { path: p.path, name: p.name, exists };
          } catch {
            return { path: p.path, name: p.name, exists: false };
          }
        }),
      );
      setStatuses(results);
    };
    check();
  }, [recentProjects]);

  if (recentProjects.length === 0) return null;

  return (
    <div className="w-full max-w-xs">
      <p className="mb-2 text-[length:var(--font-sidebar-section)] font-medium text-muted-foreground/60 uppercase tracking-wider">
        Recent
      </p>
      {statuses.map((p) => (
        <div key={p.path} className="group flex items-center gap-1.5 py-1">
          {p.exists ? (
            <button
              type="button"
              className="flex flex-1 items-center gap-2 min-w-0 text-[length:var(--font-button)] text-muted-foreground hover:text-foreground transition-colors text-left"
              onClick={async () => {
                const ok = await projectOpen(p.path);
                if (!ok) return;
                addRecentProject(p.path);
                openProject(p.path);
              }}
            >
              <FolderIcon className="size-3.5 shrink-0 opacity-60" />
              <span className="truncate">{p.name}</span>
            </button>
          ) : (
            <div className="flex flex-1 items-center gap-2 min-w-0 text-[length:var(--font-button)] text-muted-foreground/30">
              <AlertCircleIcon className="size-3.5 shrink-0" />
              <span className="truncate">{p.name}</span>
            </div>
          )}
          <button
            type="button"
            className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-muted-foreground transition-all"
            onClick={(e) => { e.stopPropagation(); removeRecentProject(p.path); }}
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Welcome Page ───

export function WelcomePage() {
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);
  const projectOpen = useProjectOpen();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const [parentPath, setParentPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const fullPath = parentPath && projectName.trim()
    ? `${parentPath}/${projectName.trim()}`
    : "";

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

  const handleSelectParent = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (!result.canceled && result.path) setParentPath(result.path);
  };

  const handleCreate = async () => {
    if (!fullPath) return;
    setCreating(true);
    try {
      await window.electronAPI.projectCreate(fullPath);
      addRecentProject(fullPath);
      await openProject(fullPath);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Minimal titlebar */}
      <div className="drag-region flex h-[var(--height-welcome-titlebar)] shrink-0 items-center justify-end px-3 gap-1">
        <button
          type="button"
          className="no-drag flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`Theme: ${theme}`}
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
        <button
          type="button"
          className="no-drag flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="More"
        >
          <EllipsisIcon className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        {/* Wordmark */}
        <div className="flex items-center gap-3 mb-12">
          <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
            <SparklesIcon className="size-4 text-background" />
          </div>
          <span className="text-lg font-medium text-foreground tracking-tight">Prism</span>
        </div>

        {/* New project */}
        <div className="w-full max-w-xs space-y-2 mb-6">
          <p className="text-[length:var(--font-sidebar-section)] font-medium text-muted-foreground/60 uppercase tracking-wider">
            New Project
          </p>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[length:var(--font-button)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
            onClick={handleSelectParent}
          >
            <FolderOpenIcon className="size-4 shrink-0 opacity-60" />
            <span className={parentPath ? "text-foreground" : ""}>
              {parentPath ? parentPath.split("/").pop() || parentPath : "Select location"}
            </span>
            {parentPath && (
              <span className="ml-auto text-[length:var(--font-path)] text-muted-foreground/40 truncate max-w-[120px]">
                {parentPath}
              </span>
            )}
          </button>

          {parentPath && (
            <>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2">
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/30" />
                <input
                  type="text"
                  className="flex-1 bg-transparent text-[length:var(--font-input)] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  placeholder="Project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={creating}
                  autoFocus
                />
              </div>

              {projectName.trim() && (
                <p className="px-3 text-[length:var(--font-path)] text-muted-foreground/40 truncate font-mono">
                  {fullPath}
                </p>
              )}

              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[length:var(--font-button)] font-medium text-background hover:bg-foreground/90 transition-colors disabled:opacity-30"
                disabled={!projectName.trim() || creating}
                onClick={handleCreate}
              >
                {creating ? (
                  <><Loader2Icon className="size-3.5 animate-spin" /> Creating...</>
                ) : (
                  "Create Project"
                )}
              </button>
            </>
          )}
        </div>

        {/* Open existing */}
        <div className="w-full max-w-xs mb-6">
          <p className="mb-2 text-[length:var(--font-sidebar-section)] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Open
          </p>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[length:var(--font-button)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
            onClick={handleOpen}
          >
            <FolderOpenIcon className="size-4 shrink-0 opacity-60" />
            Open project folder
          </button>
        </div>

        <RecentProjects projectOpen={projectOpen} />
      </div>
    </div>
  );
}
