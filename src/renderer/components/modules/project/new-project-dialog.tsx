import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  dialogActionButtonsClass,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { parseRemoteAbs, remoteHomeFromAppHome } from "@shared/remote";
import { dialogDesktop } from "@/lib/desktop-api/dialog";
import { projectDesktop } from "@/lib/desktop-api/project";
import { newProjectRoot, type NewProjectLocation } from "@/lib/project/new-project-location";
import { openRemoteWorkbenchProject } from "@/lib/workspace/project-lifecycle";
import { RemoteFolderBrowser } from "@/components/modules/remote/remote-folder-dialog";
import { remotePhaseIsReady } from "@/lib/remote/ensure-connected";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRemoteStore } from "@/stores/remote-store";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  FOLDER_FUNCTIONS,
  FOLDER_FUNCTION_LABELS,
  type FolderFunction,
  type WorkspaceFolder,
} from "@/types/workspace";
import { defaultFolderIcon } from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import {
  FolderOpenIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  GitBranchIcon,
  FileTextIcon,
  FlaskConicalIcon,
  SparklesIcon,
  FolderTreeIcon,
  CheckIcon,
  SlidersHorizontalIcon,
  FolderIcon,
  ChevronDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SETTINGS_FORM_FIELD,
  SETTINGS_FORM_INPUT,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "@/components/modules/settings/settings-tokens";
type PresetId = "paper" | "research" | "minimal" | "custom";

interface NewProjectPaneProps {
  /** Welcome right pane: no dialog chrome / extra card shell. */
  embedded?: boolean;
  /** Welcome already renders the page title + back control. */
  hideTitle?: boolean;
  locationSeed?: { kind: "remote"; profileId: string };
  onCancel?: () => void;
  onCreated?: (path: string) => void;
}

const PRESET_OPTIONS: Array<{
  id: Exclude<PresetId, "custom">;
  icon: typeof FileTextIcon;
  titleKey: "project.new.paper" | "project.new.research" | "project.new.minimal";
  descKey: "project.new.paperDesc" | "project.new.researchDesc" | "project.new.minimalDesc";
  recommended?: boolean;
}> = [
  {
    id: "paper",
    icon: FileTextIcon,
    titleKey: "project.new.paper",
    descKey: "project.new.paperDesc",
    recommended: true,
  },
  {
    id: "research",
    icon: FlaskConicalIcon,
    titleKey: "project.new.research",
    descKey: "project.new.researchDesc",
  },
  {
    id: "minimal",
    icon: SparklesIcon,
    titleKey: "project.new.minimal",
    descKey: "project.new.minimalDesc",
  },
];

interface NewProjectDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  locationSeed?: { kind: "remote"; profileId: string };
  onCreated?: (path: string) => void;
}

interface NewFolderEntry {
  name: string;
  function: FolderFunction;
}

const PRESET_FOLDERS: Record<Exclude<PresetId, "custom">, NewFolderEntry[]> = {
  paper: [
    { name: "manuscript", function: "manuscript" },
    { name: "literature", function: "literature" },
  ],
  research: [
    { name: "manuscript", function: "manuscript" },
    { name: "literature", function: "literature" },
    { name: "experiments", function: "experiment" },
  ],
  minimal: [{ name: "manuscript", function: "manuscript" }],
};

function foldersEqual(a: NewFolderEntry[], b: NewFolderEntry[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((f, i) => f.name === b[i]?.name && f.function === b[i]?.function);
}

function toCreateDirs(folders: NewFolderEntry[]): WorkspaceFolder[] {
  return folders
    .filter((f) => f.name.trim())
    .map((f) => {
      if (f.function === "manuscript") {
        return { function: "manuscript" as const, name: f.name.trim(), mainTex: "main.tex" };
      }
      return { function: f.function, name: f.name.trim() } as WorkspaceFolder;
    });
}

export function LiveStructurePreview({
  projectName,
  folders,
  initGit,
}: {
  projectName: string;
  folders: Array<{ name: string; function: FolderFunction }>;
  initGit: boolean;
}) {
  const { t } = useTranslation();
  const root = projectName.trim() || "my-paper";

  const getFunctionBadge = (fn: FolderFunction) => {
    switch (fn) {
      case "manuscript":
        return t("project.new.manuscriptTag", "LaTeX 论文手稿");
      case "literature":
        return t("project.new.literatureTag", "文献与 BibTeX");
      case "experiment":
        return t("project.new.experimentsTag", "实验与运行记录");
      default:
        return FOLDER_FUNCTION_LABELS[fn] || fn;
    }
  };

  return (
    <div className="rounded-md bg-muted p-3 font-sans text-[length:var(--font-size-12)] text-foreground">
      <div className="mb-2 flex items-center justify-between font-sans">
        <div className="flex items-center gap-1.5 text-[length:var(--font-size-12)] font-medium text-foreground">
          <FolderTreeIcon className="size-3.5 text-muted-foreground" />
          <span>{t("project.new.previewTitle")}</span>
        </div>
        {initGit ? (
          <span className="inline-flex items-center gap-1 text-[length:var(--font-badge)] text-muted-foreground font-sans">
            <GitBranchIcon className="size-2.5" />
            {t("project.new.gitInitialized")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <FolderIcon className="size-3.5 text-primary" />
          <span>{root}/</span>
        </div>

        <div className="flex items-center gap-1.5 pl-4 text-muted-foreground">
          <span className="text-muted-foreground/50">├──</span>
          <FolderIcon className="size-3 text-muted-foreground" />
          <span className="text-foreground/80">.workbench/</span>
          <span className="font-sans text-[length:var(--font-badge)] text-muted-foreground">
            ({t("project.new.prismnextConfigTag", "智能体规则与配置")})
          </span>
        </div>

        {folders.map((f, idx) => {
          const isLast = idx === folders.length - 1;
          const folderName = f.name.trim() || "untitled";
          const symbol = isLast ? "└──" : "├──";

          return (
            <div key={idx} className="flex flex-col">
              <div className="flex items-center gap-1.5 pl-4">
                <span className="text-muted-foreground/50">{symbol}</span>
                <WorkspaceFolderIcon
                  name={defaultFolderIcon(f.function)}
                  className="size-3 text-foreground/80"
                />
                <span className="font-medium text-foreground">{folderName}/</span>
                <span className="font-sans text-[length:var(--font-badge)] text-muted-foreground">
                  ({getFunctionBadge(f.function)})
                </span>
              </div>

              {f.function === "manuscript" ? (
                <div className="flex items-center gap-1.5 pl-9 text-[length:var(--font-size-12)] text-muted-foreground">
                  <span className="text-muted-foreground/40">└──</span>
                  <FileTextIcon className="size-2.5 text-muted-foreground" />
                  <span>main.tex</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NewProjectPane({
  embedded = false,
  hideTitle = false,
  locationSeed,
  onCancel,
  onCreated,
}: NewProjectPaneProps) {
  const { t } = useTranslation();
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);
  const remote = locationSeed?.kind === "remote" ? locationSeed : null;
  const remoteReady = useRemoteStore((s) => (
    remote ? remotePhaseIsReady(s.byProfileId[remote.profileId]?.phase) : true
  ));

  const appDefaults = useSettingsStore((s) => s.settings.defaultWorkspaceDirs);
  const settingsInitGit = useSettingsStore((s) => s.settings.defaultInitGit !== false);

  const customFolders = useMemo<NewFolderEntry[]>(() => {
    if (appDefaults && appDefaults.length > 0) {
      return appDefaults.map((d) => ({ name: d.name, function: d.function as FolderFunction }));
    }
    return PRESET_FOLDERS.paper.map((f) => ({ ...f }));
  }, [appDefaults]);

  const [parentPath, setParentPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [preset, setPreset] = useState<PresetId>("paper");
  const [workspaceFolders, setWorkspaceFolders] = useState<NewFolderEntry[]>(() =>
    PRESET_FOLDERS.paper.map((f) => ({ ...f })),
  );
  const [initGit, setInitGit] = useState(settingsInitGit);
  const [showCustomFolders, setShowCustomFolders] = useState(false);
  const [browseRemote, setBrowseRemote] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!remote) return;
    const state = useRemoteStore.getState().byProfileId[remote.profileId];
    const handshake = state?.phase === "ready" ? state.handshake : null;
    const home = handshake ? remoteHomeFromAppHome(handshake.appHome) : null;
    if (home) setParentPath(home);
  }, [remote]);

  useEffect(() => {
    if (remote && !remoteReady) setBrowseRemote(true);
  }, [remote, remoteReady]);

  const location: NewProjectLocation = remote
    ? { kind: "remote", profileId: remote.profileId, parentPosix: parentPath }
    : { kind: "local", parentPath };
  const previewRoot = newProjectRoot(location, projectName);
  const hasManuscript = workspaceFolders.some((f) => f.function === "manuscript");
  const canCreate = Boolean(previewRoot && hasManuscript) && !creating;

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    if (id === "custom") {
      setWorkspaceFolders(customFolders.map((f) => ({ ...f })));
      setShowCustomFolders(true);
      return;
    }
    setWorkspaceFolders(PRESET_FOLDERS[id].map((f) => ({ ...f })));
    setShowCustomFolders(false);
  };

  const markCustomIfEdited = (next: NewFolderEntry[]) => {
    setWorkspaceFolders(next);
    if (preset === "custom") return;
    const baseline = PRESET_FOLDERS[preset as Exclude<PresetId, "custom">];
    if (!foldersEqual(next, baseline)) setPreset("custom");
  };

  const handleSelectParent = async () => {
    if (remote) {
      setBrowseRemote((open) => !open);
      return;
    }
    const result = await dialogDesktop.dialogOpenFolder();
    if (result && !result.canceled && result.path) setParentPath(result.path);
  };

  const handleCreate = async () => {
    if (!hasManuscript) return;
    const root = previewRoot;
    if (!root) return;
    setCreating(true);
    try {
      const workspaceDirs = toCreateDirs(workspaceFolders);
      await projectDesktop.projectCreate(root, workspaceDirs, {
        initGit,
      });
      addRecentProject(root);
      if (remote) {
        const parsed = parseRemoteAbs(root);
        if (!parsed) throw new Error(t("project.new.createFailed"));
        await openRemoteWorkbenchProject(parsed.profileId, parsed.abs);
      } else {
        await openProject(root);
      }
      onCreated?.(root);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("project.new.createFailed");
      console.error("Project creation failed:", err);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const locationName = projectName.trim() || "my-paper";

  return (
    <div>
      {hideTitle ? null : (
      <div
        className={cn(
          "space-y-1",
          embedded ? "pb-5" : "px-6 pt-5 pb-3",
        )}
      >
        <h2 className="text-[length:var(--font-dialog-title)] font-semibold tracking-tight">
          {t("project.new.title")}
        </h2>
        <p className="text-[length:var(--font-dialog-label)] text-muted-foreground">
          {remote
            ? t("project.new.remoteDescription", { host: remote.profileId })
            : t("project.new.description")}
        </p>
      </div>
      )}

      <div className={cn("space-y-6", !embedded && "px-6 py-5")}>
          <div className="space-y-4">
            <div className={SETTINGS_FORM_FIELD}>
              <label className={SETTINGS_ROW_LABEL}>{t("project.new.projectName")}</label>
              <Input
                ref={inputRef}
                className={cn(SETTINGS_FORM_INPUT, "h-9 min-w-0 font-medium")}
                placeholder="my-paper"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={creating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) void handleCreate();
                }}
              />
            </div>

            <div className={SETTINGS_FORM_FIELD}>
              <label className={SETTINGS_ROW_LABEL}>{t("project.new.location")}</label>
              <div
                className={cn(
                  "overflow-hidden rounded-md border border-input",
                  remote && browseRemote && "bg-background",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center gap-2 bg-transparent px-3 text-left text-[length:var(--font-size-12)] transition-colors hover:bg-muted",
                    !parentPath && "text-muted-foreground",
                  )}
                  onClick={() => void handleSelectParent()}
                  disabled={creating}
                  aria-expanded={remote ? browseRemote : undefined}
                >
                  <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
                  {parentPath ? (
                    <span className="flex min-w-0 flex-1 items-baseline">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {parentPath.replace(/[/\\]$/, "")}/
                      </span>
                      <span
                        className={cn(
                          "shrink-0",
                          projectName.trim()
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {locationName}
                      </span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">
                      {remote && !remoteReady
                        ? t("remote.phase.connecting")
                        : t(remote ? "project.new.chooseRemoteParent" : "project.new.chooseParent")}
                    </span>
                  )}
                  {remote ? (
                    <ChevronDownIcon
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        browseRemote && "rotate-180",
                      )}
                    />
                  ) : null}
                </button>
                {remote && browseRemote ? (
                  <div className="border-t border-border">
                    <RemoteFolderBrowser
                      alias={remote.profileId}
                      embedded
                      confirmLabel={t("remote.useFolder")}
                      onConfirm={async (remoteRoot) => {
                        setParentPath(remoteRoot);
                        setBrowseRemote(false);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={SETTINGS_FORM_FIELD}>
            <div className="flex items-center justify-between">
              <label className={SETTINGS_ROW_LABEL}>{t("project.new.template")}</label>
              <button
                type="button"
                disabled={creating}
                onClick={() => {
                  setShowCustomFolders((v) => !v);
                  if (!showCustomFolders) setPreset("custom");
                }}
                className="flex items-center gap-1 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors"
              >
                <SlidersHorizontalIcon className="size-3" />
                <span>
                  {showCustomFolders
                    ? t("common.hide", "收起高级配置")
                    : t("project.new.editFolders", "自定义文件夹")}
                </span>
              </button>
            </div>

            <div className="flex flex-col">
              {PRESET_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = preset === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={creating}
                    onClick={() => applyPreset(option.id)}
                    className="group flex items-start gap-2 py-1 text-left transition-colors"
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[length:var(--font-size-13)] font-medium",
                            selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                          )}
                        >
                          {t(option.titleKey)}
                        </span>
                        {option.recommended ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[length:var(--font-badge)] font-medium text-muted-foreground">
                            {t("project.new.recommended")}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[length:var(--font-size-12)]",
                          selected
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        {t(option.descKey)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {showCustomFolders ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[length:var(--font-size-12)] font-semibold text-foreground">
                  {t("project.new.folders")}
                </p>
                <button
                  type="button"
                  disabled={creating}
                  onClick={() =>
                    markCustomIfEdited([
                      ...workspaceFolders,
                      { name: "", function: "literature" },
                    ])
                  }
                  className="flex items-center gap-1 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground"
                >
                  <PlusIcon className="size-3" />
                  {t("project.new.addFolder")}
                </button>
              </div>
              <p className="text-[length:var(--font-size-12)] text-muted-foreground">
                {t("project.new.customDesc")}
              </p>

              <div className="space-y-1">
                {workspaceFolders.map((f, i) => {
                  const manuscriptTaken = workspaceFolders.some(
                    (x, j) => x.function === "manuscript" && j !== i,
                  );
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        className="h-6 min-w-0 flex-1 !px-2 !text-[length:var(--font-size-12)] font-sans shadow-none"
                        placeholder="folder-name"
                        value={f.name}
                        disabled={creating}
                        onChange={(e) => {
                          const next = [...workspaceFolders];
                          next[i] = { ...next[i], name: e.target.value };
                          markCustomIfEdited(next);
                        }}
                      />
                      <AppSelect
                        value={f.function}
                        disabled={creating}
                        onValueChange={(v) => {
                          const next = [...workspaceFolders];
                          next[i] = { ...next[i], function: v as FolderFunction };
                          markCustomIfEdited(next);
                        }}
                      >
                        <AppSelectTrigger className="w-[7.75rem] shrink-0">
                          <AppSelectValue />
                        </AppSelectTrigger>
                        <AppSelectContent>
                          {FOLDER_FUNCTIONS.map((fn) => (
                            <AppSelectItem
                              key={fn}
                              value={fn}
                              disabled={fn === "manuscript" && manuscriptTaken}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <WorkspaceFolderIcon
                                  name={defaultFolderIcon(fn)}
                                  className="size-3"
                                />
                                {FOLDER_FUNCTION_LABELS[fn]}
                              </span>
                            </AppSelectItem>
                          ))}
                        </AppSelectContent>
                      </AppSelect>
                      <Hint label={t("project.new.removeFolder")}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={creating}
                          onClick={() =>
                            markCustomIfEdited(workspaceFolders.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </Hint>
                    </div>
                  );
                })}
              </div>

              {!hasManuscript ? (
                <p className="text-[length:var(--font-size-12)] font-medium text-destructive">
                  {t("project.new.needManuscript")}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* ── Section 4: Live Structure Preview ── */}
          <LiveStructurePreview
            projectName={projectName}
            folders={workspaceFolders}
            initGit={initGit}
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className={SETTINGS_ROW_LABEL}>{t("project.new.initGit")}</p>
                <p className={SETTINGS_ROW_DESC}>{t("project.new.initGitDesc")}</p>
              </div>
            </div>
            <Switch checked={initGit} disabled={creating} onCheckedChange={setInitGit} />
          </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-end gap-2",
          dialogActionButtonsClass,
          embedded ? "pt-2" : "px-6 pb-5",
        )}
      >
        {embedded ? null : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={creating}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        )}
        <Button
          type="button"
          size="xs"
          disabled={!canCreate}
          onClick={() => void handleCreate()}
          className="gap-1"
        >
          {creating ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              {t("project.new.creating")}
            </>
          ) : (
            <>
              <CheckIcon className="size-3.5" />
              {t("project.new.createProject")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function NewProjectDialog({
  children,
  open: controlledOpen,
  onOpenChange,
  locationSeed,
  onCreated,
}: NewProjectDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onOpenChange?.(value);
    else setInternalOpen(value);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent aria-describedby={undefined} className="gap-0 overflow-hidden p-0 sm:max-w-xl sm:rounded-xl">
        <NewProjectPane
          locationSeed={locationSeed}
          onCancel={() => setOpen(false)}
          onCreated={(path) => {
            setOpen(false);
            onCreated?.(path);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

