import { useEffect, useState } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useWorkspaceProjectAutosave } from "@/hooks/use-workspace-project-autosave";
import { Button } from "@/components/ui/button";
import {
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  type WorkspaceFolder,
} from "@/types/workspace";
import { resolveFolderIconName } from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import { appDefaultWorkspaceTemplate } from "@/lib/settings/workspace-template";
import type { WorkspaceFolderScope } from "@/lib/settings/workspace-template";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";
import { FolderIcon, PlusIcon, RotateCcwIcon, Settings2Icon } from "lucide-react";

const CARD = SETTINGS_CARD;
const ROW = SETTINGS_ROW;
const ROW_LABEL = SETTINGS_ROW_LABEL;
const ROW_DESC = SETTINGS_ROW_DESC;
const CATEGORY_HEADER = SETTINGS_CATEGORY_HEADER;

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0 bg-muted text-muted-foreground";

function projectDisplayName(projectRoot: string): string {
  const parts = projectRoot.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || projectRoot;
}

function folderSummary(folder: WorkspaceFolder): string {
  const desc = folder.description || DEFAULT_FUNCTION_DESCRIPTIONS[folder.function];
  if (!desc) return "No description";
  return desc.length > 120 ? `${desc.slice(0, 117)}…` : desc;
}

function useFolderOnDisk(projectRoot: string | null, folderName: string, enabled: boolean) {
  const [onDisk, setOnDisk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled || !projectRoot || !folderName) {
      setOnDisk(null);
      return;
    }
    let cancelled = false;
    const abs = `${projectRoot.replace(/[/\\]+$/, "")}/${folderName}`;
    window.electronAPI
      .fsExists(abs)
      .then((exists) => {
        if (!cancelled) setOnDisk(exists);
      })
      .catch(() => {
        if (!cancelled) setOnDisk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, folderName, enabled]);

  return onDisk;
}

function openFolderEditor(scope: WorkspaceFolderScope, index: number) {
  openSettingsPanel({ kind: "workspace-folder", scope, mode: "edit", index });
}

function openAddFolder(scope: WorkspaceFolderScope) {
  openSettingsPanel({ kind: "workspace-folder", scope, mode: "new" });
}

function FolderSummaryRow({
  folder,
  index,
  scope,
  projectRoot,
  showDisk,
}: {
  folder: WorkspaceFolder;
  index: number;
  scope: WorkspaceFolderScope;
  projectRoot?: string | null;
  showDisk?: boolean;
}) {
  const onDisk = useFolderOnDisk(projectRoot ?? null, folder.name, Boolean(showDisk && projectRoot));
  const mainTex = folder.function === "manuscript" ? folder.mainTex : null;

  return (
    <div className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <WorkspaceFolderIcon
            name={resolveFolderIconName(folder)}
            className="size-3 shrink-0 text-muted-foreground/80"
            title="Files tree badge"
          />
          <span className={ROW_LABEL}>{folder.name}</span>
          <span className={BADGE}>{FOLDER_FUNCTION_LABELS[folder.function]}</span>
        </div>
        <p className={cn(ROW_DESC, "line-clamp-2")}>{folderSummary(folder)}</p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/60 mt-0.5">
          {mainTex ? (
            <>
              <span className="font-mono text-primary">{mainTex}</span>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
            </>
          ) : null}
          {showDisk && onDisk !== null
            ? onDisk
              ? "On disk"
              : "Not on disk"
            : scope === "template"
              ? "Template only"
              : null}
        </p>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="shrink-0"
        onClick={() => openFolderEditor(scope, index)}
      >
        <Settings2Icon className="size-3 mr-1" />
        Configure
      </Button>
    </div>
  );
}

function saveStatusText(status: ReturnType<typeof useWorkspaceProjectAutosave>): string | null {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  if (status === "error") return "Save failed";
  return null;
}

export function WorkspaceSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { workspaceDirs, loaded } = useWorkspaceConfigStore();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const saveStatus = useWorkspaceProjectAutosave(projectRoot, loaded);
  const templateDirs = settings.defaultWorkspaceDirs ?? [];

  const syncTemplateFromProject = () => {
    if (!projectRoot || workspaceDirs.length === 0) {
      toast.error("Open a project with folders to sync.");
      return;
    }
    updateSettings({ defaultWorkspaceDirs: [...workspaceDirs] });
    toast.success("Template updated from this project.");
  };

  const resetTemplateToAppDefault = () => {
    updateSettings({
      defaultWorkspaceDirs: appDefaultWorkspaceTemplate(),
      defaultDocClass: "article",
    });
    toast.success("Template reset to app defaults.");
  };

  if (projectRoot && !loaded) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Workspace</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              Research folder layout for this project and for new projects.
            </p>
          </div>
          <div className={CARD}>
            <div className="py-4 px-1">
              <p className={ROW_DESC}>Loading workspace configuration…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = saveStatusText(saveStatus);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Workspace</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Folder layout for AI agents. Use Configure to edit names, descriptions, and manuscript
            settings in the panel on the right.
          </p>
        </div>

        {projectRoot ? (
          <div>
            <p className={CATEGORY_HEADER}>This project</p>
            <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
              <span className="font-medium text-foreground">{projectDisplayName(projectRoot)}</span>
              {statusLabel ? (
                <>
                  <span className="text-muted-foreground/40 mx-1.5">·</span>
                  {statusLabel}
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Button variant="outline" size="xs" onClick={() => openAddFolder("project")}>
                <PlusIcon className="size-3 mr-1" />
                Add folder
              </Button>
            </div>

            <div className={CARD}>
              {workspaceDirs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <FolderIcon className="size-8 text-muted-foreground/30" />
                  <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                    No folders configured.
                  </p>
                  <Button variant="outline" size="xs" onClick={() => openAddFolder("project")}>
                    <PlusIcon className="size-3 mr-1" />
                    Add folder
                  </Button>
                </div>
              ) : (
                workspaceDirs.map((folder, i) => (
                  <FolderSummaryRow
                    key={`project:${folder.function}:${folder.name}:${i}`}
                    folder={folder}
                    index={i}
                    scope="project"
                    projectRoot={projectRoot}
                    showDisk
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className={CARD}>
            <div className="py-4 px-1">
              <p className={ROW_DESC}>
                Open a project to edit its live workspace. You can still configure the new-project
                template below.
              </p>
            </div>
          </div>
        )}

        <div>
          <p className={CATEGORY_HEADER}>New project template</p>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2 leading-relaxed">
            Used only when you create a new project — not applied to projects you have already
            opened. Sync copies this project&apos;s folder list; folders edit via Configure.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {projectRoot ? (
              <Button
                variant="ghost"
                size="xs"
                className="text-muted-foreground"
                title="Sync from this project"
                onClick={syncTemplateFromProject}
              >
                Sync
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              title="Reset template to app default"
              onClick={resetTemplateToAppDefault}
            >
              <RotateCcwIcon className="size-3 mr-1" />
              Reset
            </Button>
            <Button variant="outline" size="xs" onClick={() => openAddFolder("template")}>
              <PlusIcon className="size-3 mr-1" />
              Add folder
            </Button>
          </div>

          <div className={CARD}>
            {templateDirs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <FolderIcon className="size-8 text-muted-foreground/30" />
                <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                  No template folders.
                </p>
                <Button variant="outline" size="xs" onClick={() => openAddFolder("template")}>
                  <PlusIcon className="size-3 mr-1" />
                  Add folder
                </Button>
              </div>
            ) : (
              templateDirs.map((folder, i) => (
                <FolderSummaryRow
                  key={`template:${folder.function}:${folder.name}:${i}`}
                  folder={folder}
                  index={i}
                  scope="template"
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
