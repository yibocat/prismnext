import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SETTINGS_FORM_FIELD,
  SETTINGS_FORM_INPUT,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "@/components/modules/settings/settings-tokens";
import {
  DEFAULT_PROJECT_ICON,
} from "./project-icon";
import { IconPicker } from "../shared/icon-picker";
import type { IconSpec } from "@shared/icon-spec";

type PresetId = "paper" | "research" | "minimal" | "custom";

interface NewProjectPaneProps {
  /** Welcome right pane: no dialog chrome / extra card shell. */
  embedded?: boolean;
  /** Welcome already renders the page title + back control. */
  hideTitle?: boolean;
  onCancel?: () => void;
  onCreated?: () => void;
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
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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

function LiveStructurePreview({
  projectName,
  folders,
  initGit,
}: {
  projectName: string;
  folders: NewFolderEntry[];
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
    <div className="rounded-xl border border-border bg-muted p-3 font-mono text-[length:var(--font-size-11)] text-foreground">
      <div className="mb-2 flex items-center justify-between border-b border-border pb-1.5 font-sans">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <FolderTreeIcon className="size-3.5 text-muted-foreground" />
          <span>{t("project.new.previewTitle")}</span>
        </div>
        {initGit ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-sans">
            <GitBranchIcon className="size-2.5" />
            {t("project.new.gitInitialized")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 text-[11px] leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <FolderIcon className="size-3.5 text-primary" />
          <span>{root}/</span>
        </div>

        <div className="flex items-center gap-1.5 pl-4 text-muted-foreground">
          <span className="text-muted-foreground/50">├──</span>
          <FolderIcon className="size-3 text-muted-foreground" />
          <span className="text-foreground/80">.workbench/</span>
          <span className="font-sans text-[10px] text-muted-foreground/70">
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
                <span className="font-sans text-[10px] text-muted-foreground">
                  ({getFunctionBadge(f.function)})
                </span>
              </div>

              {f.function === "manuscript" ? (
                <div className="flex items-center gap-1.5 pl-9 text-[10px] text-muted-foreground">
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
  onCancel,
  onCreated,
}: NewProjectPaneProps) {
  const { t } = useTranslation();
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);

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
  const [projectIcon, setProjectIcon] = useState<IconSpec | null>({
    kind: "emoji",
    value: DEFAULT_PROJECT_ICON,
  });
  const [pendingIconPngBase64, setPendingIconPngBase64] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const fullPath =
    parentPath && projectName.trim() ? `${parentPath}/${projectName.trim()}` : "";

  const hasManuscript = workspaceFolders.some((f) => f.function === "manuscript");
  const canCreate =
    Boolean(projectName.trim() && parentPath && hasManuscript) && !creating;

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
    const result = await window.electronAPI?.dialogOpenFolder?.();
    if (result && !result.canceled && result.path) setParentPath(result.path);
  };

  const handleCreate = async () => {
    if (!fullPath || !hasManuscript) return;
    setCreating(true);
    try {
      const workspaceDirs = toCreateDirs(workspaceFolders);
      const icon = projectIcon ?? { kind: "emoji", value: DEFAULT_PROJECT_ICON };
      await window.electronAPI?.projectCreate?.(fullPath, workspaceDirs, {
        initGit,
        projectIcon: icon.kind === "image" ? undefined : icon,
        projectIconImagePngBase64: pendingIconPngBase64 ?? undefined,
      });
      addRecentProject(fullPath);
      onCreated?.();
      await openProject(fullPath);
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
          embedded ? "pb-5" : "border-b border-border px-6 pt-5 pb-4",
        )}
      >
        <h2 className="text-[length:var(--font-size-15)] font-semibold tracking-tight">
          {t("project.new.title")}
        </h2>
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">
          {t("project.new.description")}
        </p>
      </div>
      )}

      <div className={cn("space-y-6", !embedded && "px-6 py-5")}>
          <div className="space-y-4">
            <div className={SETTINGS_FORM_FIELD}>
              <label className={SETTINGS_ROW_LABEL}>{t("project.new.projectName")}</label>
              <div className="flex items-center gap-2">
                <IconPicker
                  value={projectIcon}
                  onChange={setProjectIcon}
                  onPendingImagePngBase64={setPendingIconPngBase64}
                  name={projectName || "P"}
                  fallback="letter"
                  size="sm"
                  disabled={creating}
                  triggerLabel={t("project.new.chooseIcon")}
                />
                <Input
                  ref={inputRef}
                  className={cn(SETTINGS_FORM_INPUT, "h-9 min-w-0 flex-1 font-medium")}
                  placeholder="my-paper"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={creating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCreate) void handleCreate();
                  }}
                />
              </div>
            </div>

            <div className={SETTINGS_FORM_FIELD}>
              <label className={SETTINGS_ROW_LABEL}>{t("project.new.location")}</label>
              <button
                type="button"
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[length:var(--font-size-12)] transition-colors hover:bg-muted",
                  !parentPath && "text-muted-foreground",
                )}
                onClick={() => void handleSelectParent()}
                disabled={creating}
              >
                <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />
                {parentPath ? (
                  <span className="flex min-w-0 items-baseline">
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
                  <span className="truncate">{t("project.new.chooseParent")}</span>
                )}
              </button>
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
                className="flex items-center gap-1 text-[length:var(--font-size-11)] text-muted-foreground hover:text-foreground transition-colors"
              >
                <SlidersHorizontalIcon className="size-3" />
                <span>
                  {showCustomFolders
                    ? t("common.hide", "收起高级配置")
                    : t("project.new.editFolders", "自定义文件夹")}
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {PRESET_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = preset === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={creating}
                    onClick={() => applyPreset(option.id)}
                    className="group flex items-start gap-2.5 py-1.5 text-left transition-colors"
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
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {t("project.new.recommended")}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[length:var(--font-size-11)]",
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[length:var(--font-size-12)] font-semibold text-foreground">
                    {t("project.new.folders")}
                  </p>
                  <p className="text-[length:var(--font-size-11)] text-muted-foreground">
                    {t("project.new.customDesc")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2.5 text-[length:var(--font-size-11)]"
                  disabled={creating}
                  onClick={() =>
                    markCustomIfEdited([
                      ...workspaceFolders,
                      { name: "", function: "literature" },
                    ])
                  }
                >
                  <PlusIcon className="size-3.5" />
                  {t("project.new.addFolder")}
                </Button>
              </div>

              <div className="space-y-2">
                {workspaceFolders.map((f, i) => {
                  const manuscriptTaken = workspaceFolders.some(
                    (x, j) => x.function === "manuscript" && j !== i,
                  );
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        className={cn(SETTINGS_FORM_INPUT, "h-8 min-w-0 flex-1 font-mono text-xs")}
                        placeholder="folder-name"
                        value={f.name}
                        disabled={creating}
                        onChange={(e) => {
                          const next = [...workspaceFolders];
                          next[i] = { ...next[i], name: e.target.value };
                          markCustomIfEdited(next);
                        }}
                      />
                      <Select
                        value={f.function}
                        disabled={creating}
                        onValueChange={(v) => {
                          const next = [...workspaceFolders];
                          next[i] = { ...next[i], function: v as FolderFunction };
                          markCustomIfEdited(next);
                        }}
                      >
                        <SelectTrigger className={cn(SETTINGS_FORM_INPUT, "h-8 w-36 shrink-0 text-xs")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FOLDER_FUNCTIONS.map((fn) => (
                            <SelectItem
                              key={fn}
                              value={fn}
                              disabled={fn === "manuscript" && manuscriptTaken}
                            >
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <WorkspaceFolderIcon
                                  name={defaultFolderIcon(fn)}
                                  className="size-3.5"
                                />
                                {FOLDER_FUNCTION_LABELS[fn]}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Hint label={t("project.new.removeFolder")}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={creating}
                          onClick={() =>
                            markCustomIfEdited(workspaceFolders.filter((_, j) => j !== i))
                          }
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </Hint>
                    </div>
                  );
                })}
              </div>

              {!hasManuscript ? (
                <p className="text-[length:var(--font-size-11)] font-medium text-destructive">
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
          embedded ? "pt-2" : "border-t border-border px-6 py-4",
        )}
      >
        {embedded ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={creating}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!canCreate}
          onClick={() => void handleCreate()}
          className="gap-1.5"
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
      <DialogContent aria-describedby={undefined} className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-xl">
        <NewProjectPane onCancel={() => setOpen(false)} onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

