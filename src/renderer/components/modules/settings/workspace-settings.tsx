import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useWorkspaceProjectAutosave } from "@/hooks/use-workspace-project-autosave";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_FUNCTION_DESCRIPTIONS,
  type WorkspaceFolder,
} from "@/types/workspace";
import { resolveFolderIconName } from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";
import { FolderIcon, PlusIcon, Settings2Icon } from "lucide-react";

const CARD = SETTINGS_CARD;
const ROW = SETTINGS_ROW;
const ROW_LABEL = SETTINGS_ROW_LABEL;
const ROW_DESC = SETTINGS_ROW_DESC;

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0 bg-muted text-muted-foreground";

function projectDisplayName(projectRoot: string): string {
  const parts = projectRoot.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || projectRoot;
}

function folderSummary(folder: WorkspaceFolder, t: TFunction): string {
  const desc =
    folder.description ||
    (folder.function === "custom"
      ? null
      : t(`settings.editor.workspaceFolder.functionDesc.${folder.function}`, {
          defaultValue: DEFAULT_FUNCTION_DESCRIPTIONS[folder.function] ?? "",
        }));
  if (!desc) return t("common.noDescription");
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
    fsDesktop
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

function openFolderEditor(index: number) {
  openSettingsPanel({ kind: "workspace-folder", mode: "edit", index });
}

function openAddFolder() {
  openSettingsPanel({ kind: "workspace-folder", mode: "new" });
}

function FolderSummaryRow({
  folder,
  index,
  projectRoot,
}: {
  folder: WorkspaceFolder;
  index: number;
  projectRoot: string;
}) {
  const { t } = useTranslation();
  const onDisk = useFolderOnDisk(projectRoot, folder.name, true);
  const mainTex = folder.function === "manuscript" ? folder.mainTex : null;

  return (
    <div className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <WorkspaceFolderIcon
            name={resolveFolderIconName(folder)}
            className="size-3 shrink-0 text-muted-foreground/80"
            title={t("settings.workspace.filesTreeBadge")}
          />
          <span className={ROW_LABEL}>{folder.name}</span>
          <span className={BADGE}>
            {t(`settings.editor.workspaceFolder.functions.${folder.function}`)}
          </span>
        </div>
        <p className={cn(ROW_DESC, "line-clamp-2")}>{folderSummary(folder, t)}</p>
        <p className="text-[length:var(--font-size-11)] text-muted-foreground/60 mt-0.5">
          {mainTex ? (
            <>
              <span className="font-mono text-primary">{mainTex}</span>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
            </>
          ) : null}
          {onDisk !== null
            ? onDisk
              ? t("settings.workspace.onDisk")
              : t("settings.workspace.notOnDisk")
            : null}
        </p>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="shrink-0"
        onClick={() => openFolderEditor(index)}
      >
        <Settings2Icon className="size-3 mr-1" />
        Configure
      </Button>
    </div>
  );
}

function saveStatusText(
  status: ReturnType<typeof useWorkspaceProjectAutosave>,
  t: TFunction,
): string | null {
  if (status === "saving") return t("common.saving");
  if (status === "saved") return t("common.saved");
  if (status === "error") return t("settings.workspace.saveFailed");
  return null;
}

function WorkspacePageChrome({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.workspace.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.workspace.pageDesc")}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function WorkspaceSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { workspaceDirs, loaded } = useWorkspaceConfigStore();
  const saveStatus = useWorkspaceProjectAutosave(projectRoot, loaded);

  if (projectRoot && !loaded) {
    return (
      <WorkspacePageChrome>
        <div className={CARD}>
          <div className="py-4 px-1">
            <p className={ROW_DESC}>{t("settings.workspace.loading")}</p>
          </div>
        </div>
      </WorkspacePageChrome>
    );
  }

  if (!projectRoot) {
    return (
      <WorkspacePageChrome>
        <div className={CARD}>
          <div className="py-4 px-1">
            <p className={ROW_DESC}>{t("settings.workspace.tabProjectHint")}</p>
          </div>
        </div>
      </WorkspacePageChrome>
    );
  }

  const statusLabel = saveStatusText(saveStatus, t);

  return (
    <WorkspacePageChrome>
      <div>
        <div className="mb-2">
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            <span className="font-medium text-foreground">{projectDisplayName(projectRoot)}</span>
            {statusLabel ? (
              <>
                <span className="text-muted-foreground/40 mx-1.5">·</span>
                {statusLabel}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Button variant="outline" size="xs" onClick={openAddFolder}>
            <PlusIcon className="size-3 mr-1" />
            {t("settings.workspace.addFolder")}
          </Button>
        </div>

        <div className={CARD}>
          {workspaceDirs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FolderIcon className="size-8 text-muted-foreground/30" />
              <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                {t("settings.workspace.empty")}
              </p>
              <Button variant="outline" size="xs" onClick={openAddFolder}>
                <PlusIcon className="size-3 mr-1" />
                {t("settings.workspace.addFolder")}
              </Button>
            </div>
          ) : (
            workspaceDirs.map((folder, i) => (
              <FolderSummaryRow
                key={`project:${folder.function}:${folder.name}:${i}`}
                folder={folder}
                index={i}
                projectRoot={projectRoot}
              />
            ))
          )}
        </div>
      </div>
    </WorkspacePageChrome>
  );
}
