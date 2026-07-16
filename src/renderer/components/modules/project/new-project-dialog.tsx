import { useState, useRef, useEffect, useMemo } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  appMenuFontClass,
  appMenuInputClass,
  appMenuLabelClass,
} from "@/components/ui/app-menu";
import { useProjectStore } from "@/stores/project-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
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
  SearchIcon,
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
  PROJECT_ICON_CATEGORIES,
  normalizeProjectIcon,
  ProjectIconBadge,
} from "./project-icon";

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

const PRESET_OPTIONS: { id: PresetId; label: string }[] = [
  { id: "minimal", label: "Minimal" },
  { id: "paper", label: "Paper" },
  { id: "research", label: "Research" },
  { id: "custom", label: "Custom" },
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
  const [projectIcon, setProjectIcon] = useState<string>(DEFAULT_PROJECT_ICON);
  const [iconOpen, setIconOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");

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
      setProjectIcon(DEFAULT_PROJECT_ICON);
      setIconOpen(false);
      setCustomEmoji("");
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
      const icon = normalizeProjectIcon(projectIcon) ?? DEFAULT_PROJECT_ICON;
      await window.electronAPI.projectCreate(fullPath, workspaceDirs, {
        initGit,
        projectIcon: icon,
      });
      addRecentProject(fullPath);
      setOpen(false);
      await openProject(fullPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create project";
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
            New Project
          </DialogTitle>
          <DialogDescription className={SETTINGS_ROW_DESC}>
            Name, location, and a workspace template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          <div className={SETTINGS_FORM_FIELD}>
            <label className={SETTINGS_ROW_LABEL}>Project name</label>
            <div className="flex items-center gap-2">
              <Popover modal={false} open={iconOpen} onOpenChange={setIconOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={creating}
                    className={cn(
                      "shrink-0 rounded-md outline-none transition-colors",
                      "hover:ring-1 hover:ring-border focus-visible:ring-1 focus-visible:ring-ring",
                      "disabled:pointer-events-none disabled:opacity-50",
                    )}
                    title="Choose project icon"
                  >
                    <ProjectIconBadge icon={projectIcon} name={projectName || "P"} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className={cn(
                    "z-[100] w-[17.5rem] overflow-hidden p-0.5",
                    appMenuFontClass,
                  )}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onWheel={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1">
                    <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <input
                      className={cn(appMenuInputClass, "h-7 min-w-0")}
                      placeholder="Paste emoji…"
                      value={customEmoji}
                      maxLength={8}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCustomEmoji(next);
                        const normalized = normalizeProjectIcon(next);
                        if (normalized) {
                          setProjectIcon(normalized);
                          setIconOpen(false);
                          setCustomEmoji("");
                        }
                      }}
                    />
                  </div>
                  <div className="mx-1 mb-1 h-px bg-border/60" />
                  <div
                    className="h-[220px] overflow-y-auto overscroll-contain"
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {PROJECT_ICON_CATEGORIES.map((cat) => (
                      <div key={cat.label} className="pb-0.5">
                        <div className={cn(appMenuLabelClass, "sticky top-0 z-10 bg-popover")}>
                          {cat.label}
                        </div>
                        <div className="grid grid-cols-8 gap-0.5 px-1 pb-1">
                          {cat.icons.map((emoji) => (
                            <button
                              key={`${cat.label}-${emoji}`}
                              type="button"
                              className={cn(
                                "flex h-8 items-center justify-center rounded-sm text-[length:var(--font-size-14)] transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                projectIcon === emoji && "bg-accent text-accent-foreground",
                              )}
                              title={emoji}
                              onClick={() => {
                                setProjectIcon(emoji);
                                setCustomEmoji("");
                                setIconOpen(false);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
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
            <label className={SETTINGS_ROW_LABEL}>Location</label>
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
                {parentPath || "Choose parent folder…"}
              </span>
            </button>
            {fullPath ? (
              <p className="truncate font-mono text-[length:var(--font-size-11)] text-muted-foreground/70">
                {fullPath}
              </p>
            ) : null}
          </div>

          <div className={SETTINGS_FORM_FIELD}>
            <label className={SETTINGS_ROW_LABEL}>Template</label>
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
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <p className="min-w-0 truncate text-[length:var(--font-size-11)] text-muted-foreground">
                {folderSummary || "No folders"}
              </p>
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowFolders((v) => !v)}
                className="shrink-0 text-[length:var(--font-size-11)] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showFolders ? "Hide" : "Edit folders"}
              </button>
            </div>
          </div>

          {showFolders ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className={SETTINGS_ROW_LABEL}>Folders</p>
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
                  Add
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={creating}
                        onClick={() =>
                          markCustomIfEdited(workspaceFolders.filter((_, j) => j !== i))
                        }
                        title="Remove folder"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              {!hasManuscript ? (
                <p className="text-[length:var(--font-size-11)] text-destructive">
                  A manuscript folder is required.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-0.5">
            <div className="min-w-0">
              <p className={SETTINGS_ROW_LABEL}>Initialize Git</p>
              <p className={SETTINGS_ROW_DESC}>Initial commit after create.</p>
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
            Cancel
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
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
