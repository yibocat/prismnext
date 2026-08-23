import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useWorkspaceProjectAutosave } from "@/hooks/use-workspace-project-autosave";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DEFAULT_FUNCTION_DESCRIPTIONS,
  type WorkspaceFolder,
} from "@/types/workspace";
import { resolveFolderIconName } from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import { fsDesktop } from "@/lib/desktop-api/fs";
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
import { Hint } from "@/components/ui/hint";

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
  const { t } = useTranslation();
  const onDisk = useFolderOnDisk(projectRoot ?? null, folder.name, Boolean(showDisk && projectRoot));
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
          {showDisk && onDisk !== null
            ? onDisk
              ? t("settings.workspace.onDisk")
              : t("settings.workspace.notOnDisk")
            : scope === "template"
              ? t("settings.workspace.templateOnly")
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

function saveStatusText(
  status: ReturnType<typeof useWorkspaceProjectAutosave>,
  t: TFunction,
): string | null {
  if (status === "saving") return t("common.saving");
  if (status === "saved") return t("common.saved");
  if (status === "error") return t("settings.workspace.saveFailed");
  return null;
}

export function WorkspaceSettings() {
  const { t } = useTranslation();
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { workspaceDirs, loaded } = useWorkspaceConfigStore();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const saveStatus = useWorkspaceProjectAutosave(projectRoot, loaded);
  const templateDirs = settings.defaultWorkspaceDirs ?? [];
  const defaultInitGit = settings.defaultInitGit !== false;

  // Default to the project tab when a project is open (project-first mental
  // model); fall back to the template tab when no project is open, since the
  // project tab has nothing to show.
  const [tab, setTab] = useState<"project" | "template">(
    projectRoot ? "project" : "template",
  );

  const resetTemplateToAppDefault = () => {
    updateSettings({
      defaultWorkspaceDirs: appDefaultWorkspaceTemplate(),
      defaultDocClass: "article",
    });
    toast.success(t("settings.workspace.toast.templateReset"));
  };

  if (projectRoot && !loaded) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
          <div>
            <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.workspace.title")}</h2>
            <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
              {t("settings.workspace.subtitle")}
            </p>
          </div>
          <div className={CARD}>
            <div className="py-4 px-1">
              <p className={ROW_DESC}>{t("settings.workspace.loading")}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = saveStatusText(saveStatus, t);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.workspace.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.workspace.pageDesc")}
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "project" | "template")}>
          <TabsList className="bg-transparent p-0 h-auto gap-4 border-b border-border w-full justify-start rounded-none">
            <TabsTrigger
              value="project"
              className="bg-transparent shadow-none rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1 pb-2 pt-1 text-muted-foreground data-[state=active]:text-foreground"
            >
              {t("settings.workspace.tabProject")}
            </TabsTrigger>
            <TabsTrigger
              value="template"
              className="bg-transparent shadow-none rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-1 pb-2 pt-1 text-muted-foreground data-[state=active]:text-foreground"
            >
              {t("settings.workspace.tabTemplate")}
            </TabsTrigger>
          </TabsList>

          {/* ── This project (project-scoped, lives in <project>/.workbench) ── */}
          <TabsContent value="project" className="mt-6 focus-visible:ring-0">
            {projectRoot ? (
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
                  <Button variant="outline" size="xs" onClick={() => openAddFolder("project")}>
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
                      <Button variant="outline" size="xs" onClick={() => openAddFolder("project")}>
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
                  <p className={ROW_DESC}>{t("settings.workspace.tabProjectHint")}</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── New project template (app-scoped, global default) ── */}
          <TabsContent value="template" className="mt-6 focus-visible:ring-0">
            <div>
              <p className={CATEGORY_HEADER}>{t("settings.workspace.newProjectTemplate")}</p>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2 leading-relaxed">
                {t("settings.workspace.templateDesc")}
              </p>

              <div className={cn(CARD, "mb-3")}>
                <div className={ROW}>
                  <div className="min-w-0">
                    <span className={ROW_LABEL}>{t("settings.workspace.initGit")}</span>
                    <p className={ROW_DESC}>{t("settings.workspace.initGitDesc")}</p>
                  </div>
                  <Switch
                    checked={defaultInitGit}
                    onCheckedChange={(checked) => {
                      void updateSettings({ defaultInitGit: checked });
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Hint label={t("settings.workspace.resetTitle")}>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={resetTemplateToAppDefault}
                  >
                    <RotateCcwIcon className="size-3 mr-1" />
                    {t("common.reset")}
                  </Button>
                </Hint>
                <Button variant="outline" size="xs" onClick={() => openAddFolder("template")}>
                  <PlusIcon className="size-3 mr-1" />
                  {t("settings.workspace.addFolder")}
                </Button>
              </div>

              <div className={CARD}>
                {templateDirs.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <FolderIcon className="size-8 text-muted-foreground/30" />
                    <p className="text-[length:var(--font-size-13)] text-muted-foreground">
                      {t("settings.workspace.emptyTemplate")}
                    </p>
                    <Button variant="outline" size="xs" onClick={() => openAddFolder("template")}>
                      <PlusIcon className="size-3 mr-1" />
                      {t("settings.workspace.addFolder")}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
