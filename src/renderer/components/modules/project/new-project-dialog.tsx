import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

interface NewProjectDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface NewFolderEntry {
  name: string;
  function: FolderFunction;
}

type PresetId = "minimal" | "paper" | "research" | "custom";

const PRESET_FOLDERS: Record<Exclude<PresetId, "custom">, NewFolderEntry[]> = {
  minimal: [{ name: "manuscript", function: "manuscript" }],
  paper: [
    { name: "manuscript", function: "manuscript" },
    { name: "literature", function: "literature" },
  ],
  research: [
    { name: "manuscript", function: "manuscript" },
    { name: "literature", function: "literature" },
    { name: "experiments", function: "experiment" },
  ],
};

const PRESET_OPTIONS: { id: PresetId; labelKey: string }[] = [
  { id: "minimal", labelKey: "project.new.minimal" },
  { id: "paper", labelKey: "project.new.paper" },
  { id: "research", labelKey: "project.new.research" },
  { id: "custom", labelKey: "project.new.custom" },
];

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

export function NewProjectDialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: NewProjectDialogProps) {
  const { t } = useTranslation();
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };

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
  const [initGit, setInitGit] = useState(true);
  const [showFolders, setShowFolders] = useState(false);
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

  const folderSummary = workspaceFolders
    .filter((f) => f.name.trim())
    .map((f) => f.name.trim())
    .join(", ");

  useEffect(() => {
    if (open) {
      setParentPath("");
      setProjectName("");
      setCreating(false);
      setPreset("paper");
      setWorkspaceFolders(PRESET_FOLDERS.paper.map((f) => ({ ...f })));
      setInitGit(settingsInitGit);
      setShowFolders(false);
      setProjectIcon({ kind: "emoji", value: DEFAULT_PROJECT_ICON });
      setPendingIconPngBase64(null);
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, settingsInitGit]);

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    if (id === "custom") {
      setWorkspaceFolders(customFolders.map((f) => ({ ...f })));
      setShowFolders(true);
      return;
    }
    setWorkspaceFolders(PRESET_FOLDERS[id].map((f) => ({ ...f })));
  };

  const markCustomIfEdited = (next: NewFolderEntry[]) => {
    setWorkspaceFolders(next);
    if (preset === "custom") return;
    const baseline = PRESET_FOLDERS[preset as Exclude<PresetId, "custom">];
    if (!foldersEqual(next, baseline)) setPreset("custom");
  };

  const handleSelectParent = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (!result.canceled && result.path) setParentPath(result.path);
  };

  const handleCreate = async () => {
    if (!fullPath || !hasManuscript) return;
    setCreating(true);
    try {
      const workspaceDirs = toCreateDirs(workspaceFolders);
      const icon = projectIcon ?? { kind: "emoji", value: DEFAULT_PROJECT_ICON };
      await window.electronAPI.projectCreate(fullPath, workspaceDirs, {
        initGit,
        projectIcon: icon.kind === "image" ? undefined : icon,
        projectIconImagePngBase64: pendingIconPngBase64 ?? undefined,
      });
      addRecentProject(fullPath);
      setOpen(false);
      await openProject(fullPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("project.new.createFailed");
      console.error("Project creation failed:", err);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="space-y-1 px-5 pt-5 pb-4">
          <DialogTitle className="text-[length:var(--font-size-15)] font-semibold tracking-tight">
            {t("project.new.title")}
          </DialogTitle>
          <DialogDescription className={SETTINGS_ROW_DESC}>
            {t("project.new.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
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
                className={cn(SETTINGS_FORM_INPUT, "min-w-0 flex-1")}
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
                "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-[length:var(--font-size-12)] transition-colors hover:bg-muted/60",
                !parentPath && "text-muted-foreground",
              )}
              onClick={() => void handleSelectParent()}
              disabled={creating}
            >
              <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {parentPath || t("project.new.chooseParent")}
              </span>
            </button>
            {fullPath ? (
              <p className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground/70">
                {fullPath}
              </p>
            ) : null}
          </div>

          <div className={SETTINGS_FORM_FIELD}>
            <label className={SETTINGS_ROW_LABEL}>{t("project.new.template")}</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={creating}
                  onClick={() => applyPreset(item.id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[length:var(--font-size-12)] transition-colors",
                    preset === item.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <p className="min-w-0 truncate text-[length:var(--font-size-11)] text-muted-foreground">
                {folderSummary || t("project.new.noFolders")}
              </p>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowFolders((v) => !v)}
                className="shrink-0 text-[length:var(--font-size-11)] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showFolders ? t("common.hide") : t("project.new.editFolders")}
              </button>
            </div>
          </div>

          {showFolders ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className={SETTINGS_ROW_LABEL}>{t("project.new.folders")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-[length:var(--font-size-12)]"
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
              <div className="space-y-1.5">
                {workspaceFolders.map((f, i) => {
                  const manuscriptTaken = workspaceFolders.some(
                    (x, j) => x.function === "manuscript" && j !== i,
                  );
                  return (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        className={cn(SETTINGS_FORM_INPUT, "min-w-0 flex-1")}
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
                        <SelectTrigger className={cn(SETTINGS_FORM_INPUT, "w-[7.5rem] shrink-0")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FOLDER_FUNCTIONS.map((fn) => (
                            <SelectItem
                              key={fn}
                              value={fn}
                              disabled={fn === "manuscript" && manuscriptTaken}
                            >
                              <span className="inline-flex items-center gap-1.5">
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
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
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
                <p className="text-[length:var(--font-size-11)] text-destructive">
                  {t("project.new.needManuscript")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-0.5">
            <div className="min-w-0">
              <p className={SETTINGS_ROW_LABEL}>{t("project.new.initGit")}</p>
              <p className={SETTINGS_ROW_DESC}>{t("project.new.initGitDesc")}</p>
            </div>
            <Switch checked={initGit} disabled={creating} onCheckedChange={setInitGit} />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3.5 gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={creating}
            onClick={() => setOpen(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
          >
            {creating ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                {t("project.new.creating")}
              </>
            ) : (
              t("common.create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
