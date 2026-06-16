import { useState, useEffect, useRef, useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FOLDER_FUNCTIONS,
  FOLDER_FUNCTION_LABELS,
  DEFAULT_FUNCTION_DESCRIPTIONS,
  createDefaultFolder,
  type FolderFunction,
  type WorkspaceFolder,
} from "@/types/workspace";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  FileText,
  FlaskConical,
  BookOpen,
  NotebookPen,
  FolderCog,
  Trash2Icon,
  RotateCcwIcon,
  PlusIcon,
  FolderIcon,
} from "lucide-react";

// ── Shared style tokens (identical to Appearance settings) ──
const TRIGGER =
  "!h-6 !px-2 !py-0 !text-[length:var(--font-size-11)] bg-background [&_svg]:!size-3";
const CARD = "rounded-lg border border-border px-4 divide-y divide-border";
const CATEGORY_HEADER =
  "text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1";
const ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
const ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
const RESET_ICON =
  "opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground";

// ── Function → lucide icon mapping ──
const FUNCTION_ICON_MAP: Record<FolderFunction, React.ComponentType<{ className?: string }>> = {
  manuscript: FileText,
  experiment: FlaskConical,
  literature: BookOpen,
  notebook: NotebookPen,
  custom: FolderCog,
};

// ── FolderRow ──

// ── MainTexField (manuscript-only, click-to-edit like folder name) ──

interface MainTexFieldProps {
  folder: WorkspaceFolder;
  index: number;
  onChange: (index: number, patch: Partial<WorkspaceFolder>) => void;
}

function MainTexField({ folder, index, onChange }: MainTexFieldProps) {
  const value = "mainTex" in folder ? (folder as { mainTex: string }).mainTex : "main.tex";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return editing ? (
    <input
      ref={inputRef}
      className="h-6 w-[75px] px-2 rounded-md border border-input bg-background text-[length:var(--font-size-12)] font-mono text-[var(--color-primary)] outline-none ring-1 ring-primary/20"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (draft.trim()) onChange(index, { mainTex: draft.trim() } as Partial<WorkspaceFolder>);
          setEditing(false);
        } else if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      onBlur={() => {
        if (draft.trim() && draft !== value) {
          onChange(index, { mainTex: draft.trim() } as Partial<WorkspaceFolder>);
        }
        setEditing(false);
      }}
      placeholder="main.tex"
    />
  ) : (
    <button
      className="h-6 px-2 rounded-md hover:bg-muted/30 transition-colors cursor-pointer text-[length:var(--font-size-12)] font-mono text-[var(--color-primary)]"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

interface FolderRowProps {
  folder: WorkspaceFolder;
  index: number;
  hasExistingManuscript: boolean;
  onChange: (index: number, patch: Partial<WorkspaceFolder>) => void;
  onRequestDelete: (index: number) => void;
  isEditingDescription: boolean;
  onStartEditDescription: () => void;
  onSaveDescription: (value: string) => void;
  onCancelEditDescription: () => void;
  /** If provided, shows RotateCcw reset button instead of Pencil edit button */
  onReset?: () => void;
}

function FolderRow({
  folder,
  index,
  hasExistingManuscript,
  onChange,
  onRequestDelete,
  isEditingDescription,
  onStartEditDescription,
  onSaveDescription,
  onCancelEditDescription,
  onReset,
}: FolderRowProps) {
  const [descDraft, setDescDraft] = useState(
    folder.description || DEFAULT_FUNCTION_DESCRIPTIONS[folder.function] || "",
  );
  const descInputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSaveRef = useRef(onSaveDescription);
  onSaveRef.current = onSaveDescription;

  // Name click-to-edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(folder.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditingDescription && descInputRef.current) {
      descInputRef.current.focus();
      descInputRef.current.select();
    }
  }, [isEditingDescription]);

  // Sync draft when folder description changes externally (but not while editing)
  useEffect(() => {
    if (!isEditingDescription) {
      setDescDraft(
        folder.description || DEFAULT_FUNCTION_DESCRIPTIONS[folder.function] || "",
      );
    }
  }, [folder.description, folder.function, isEditingDescription]);

  // Click outside to save
  useEffect(() => {
    if (!isEditingDescription) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onSaveRef.current(descDraft);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditingDescription, descDraft]);

  // Sync name draft when not editing
  useEffect(() => {
    if (!isEditingName) {
      setNameDraft(folder.name);
    }
  }, [folder.name, isEditingName]);

  // Focus name input when entering edit mode
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSaveDescription(descDraft);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEditDescription();
    }
  };

  const IconComponent = FUNCTION_ICON_MAP[folder.function];
  const displayDescription =
    folder.description || DEFAULT_FUNCTION_DESCRIPTIONS[folder.function];

  return (
    <div
      ref={containerRef}
      className={cn(
        "group px-4 py-2.5 transition-colors",
        isEditingDescription && "bg-muted/20",
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-2.5">
        {/* Function type — static label (locked after creation) */}
        <div className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-muted/30 text-[length:var(--font-size-11)] text-muted-foreground font-medium">
          <IconComponent className="size-3 shrink-0" />
          {FOLDER_FUNCTION_LABELS[folder.function]}
        </div>

        {/* Name — click-to-edit */}
        {isEditingName ? (
          <div className="flex items-center gap-1 h-6 px-2 rounded-md border border-input bg-background ring-1 ring-primary/20">
            <FolderIcon className="size-3 shrink-0 text-muted-foreground/50" />
            <input
              ref={nameInputRef}
              className="h-full w-[100px] bg-transparent text-[length:var(--font-size-12)] text-foreground outline-none"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (nameDraft.trim()) {
                    onChange(index, { name: nameDraft.trim() });
                  }
                  setIsEditingName(false);
                } else if (e.key === "Escape") {
                  setNameDraft(folder.name);
                  setIsEditingName(false);
                }
              }}
              onBlur={() => {
                if (nameDraft.trim() && nameDraft !== folder.name) {
                  onChange(index, { name: nameDraft.trim() });
                }
                setIsEditingName(false);
              }}
              placeholder="name"
            />
          </div>
        ) : (
          <button
            className="flex items-center gap-1 h-6 px-2 rounded-md hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => {
              setNameDraft(folder.name);
              setIsEditingName(true);
            }}
          >
            <FolderIcon className="size-3 shrink-0 text-muted-foreground/50" />
            <span className="text-[length:var(--font-size-12)] text-foreground">
              {folder.name}
            </span>
          </button>
        )}

        {/* Extra config — manuscript: main.tex click-to-edit */}
        {folder.function === "manuscript" ? (
          <MainTexField
            folder={folder}
            index={index}
            onChange={onChange}
          />
        ) : (
          <span className="text-[length:var(--font-size-10)] text-muted-foreground/30 w-[75px] shrink-0">
            —
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Action buttons */}
        {onReset && (
          <button
            className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            onClick={onReset}
            title="Reset to default"
          >
            <RotateCcwIcon className="size-3" />
          </button>
        )}
        <button
          className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
          onClick={() => onRequestDelete(index)}
          title="Remove folder"
        >
          <Trash2Icon className="size-3" />
        </button>
      </div>

      {/* Description row — click-to-edit */}
      <div
        className={cn(
          "mt-1 ml-[26px] flex items-start gap-1.5 rounded px-1.5 py-0.5 -ml-0.5 cursor-pointer transition-colors",
          !isEditingDescription && "hover:bg-muted/20",
        )}
        onClick={() => !isEditingDescription && onStartEditDescription()}
      >
        {isEditingDescription ? (
          <div className="flex-1">
            <textarea
              ref={descInputRef}
              className="w-full min-h-[44px] px-2 py-1.5 text-[length:var(--font-size-11)] leading-relaxed rounded-md border border-input bg-background text-foreground outline-none resize-y"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={DEFAULT_FUNCTION_DESCRIPTIONS[folder.function] || "Description for AI agents"}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/40">
                Enter to save · Esc to cancel · Shift+Enter for new line
              </span>
              <span className="text-[10px] text-muted-foreground/25 tabular-nums">
                {descDraft.length} chars
              </span>
            </div>
          </div>
        ) : (
          <span className="text-[length:var(--font-size-11)] text-muted-foreground leading-relaxed">
            {displayDescription || (
              <span className="text-muted-foreground/40 italic">No description</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ── WorkspaceSettings ──

export function WorkspaceSettings() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const {
    workspaceDirs,
    loaded,
    addFolder,
    removeFolder,
    updateFolder,
    saveConfig,
  } = useWorkspaceConfigStore();

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // ── Local UI state ──
  const [editingDescIndex, setEditingDescIndex] = useState<number | null>(null);
  const [addingCurrent, setAddingCurrent] = useState(false);
  const [addingDefaults, setAddingDefaults] = useState(false);
  const [newCurrentFunc, setNewCurrentFunc] = useState<FolderFunction>("literature");
  const [newCurrentName, setNewCurrentName] = useState("");
  const [newDefaultsFunc, setNewDefaultsFunc] = useState<FolderFunction>("literature");
  const [newDefaultsName, setNewDefaultsName] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"current" | "defaults" | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-save (Current Project) ──
  useEffect(() => {
    if (!loaded || !projectRoot) return;
    const capturedRoot = projectRoot;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      const dirs = useWorkspaceConfigStore.getState().workspaceDirs;
      const ok = await saveConfig(capturedRoot);
      if (ok) {
        const createResult = await window.electronAPI.workspaceCreateFolders(capturedRoot, dirs);
        const manuscript = dirs.find((d) => d.function === "manuscript");
        if (manuscript && createResult.created.includes(manuscript.name)) {
          const mainTexResult = await window.electronAPI.workspaceEnsureMainTex(capturedRoot);
          if (mainTexResult.created) {
            toast.success(`Created ${mainTexResult.relativePath}`, { duration: 2000 });
          }
        }
        const docStore = useDocumentStore.getState();
        if (docStore.reloadMetadataFromDisk) {
          await docStore.reloadMetadataFromDisk(true);
        }
      } else {
        const errMsg =
          useWorkspaceConfigStore.getState().error ||
          "Failed to save workspace configuration.";
        toast.error(errMsg);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        const dirs = useWorkspaceConfigStore.getState().workspaceDirs;
        if (capturedRoot) saveConfig(capturedRoot).catch(() => {});
      }
    };
  }, [workspaceDirs, loaded, projectRoot]);

  // ── Derived state ──
  const hasExistingManuscript = workspaceDirs.some((d) => d.function === "manuscript");
  const defaultDirs = settings.defaultWorkspaceDirs ?? [];
  const hasDefaultManuscript = defaultDirs.some((d) => d.function === "manuscript");

  // ── Current project folder change (wraps updateFolder to surface errors) ──
  const handleCurrentChange = useCallback(
    (index: number, patch: Partial<WorkspaceFolder>) => {
      const err = updateFolder(index, patch);
      if (err) toast.error(err);
    },
    [updateFolder],
  );

  // ── Description editing ──
  const handleSaveDescription = useCallback(
    (index: number, value: string) => {
      updateFolder(index, { description: value || undefined });
      setEditingDescIndex(null);
    },
    [updateFolder],
  );

  const handleCancelEditDescription = useCallback(() => {
    setEditingDescIndex(null);
  }, []);

  const [editingDefaultDescIndex, setEditingDefaultDescIndex] = useState<number | null>(null);

  const handleSaveDefaultDescription = useCallback(
    (index: number, value: string) => {
      const dirs = useSettingsStore.getState().settings.defaultWorkspaceDirs ?? [];
      const updated = dirs.map((d, i) =>
        i === index ? { ...d, description: value || undefined } as WorkspaceFolder : d,
      );
      updateSettings({ defaultWorkspaceDirs: updated });
      setEditingDefaultDescIndex(null);
    },
    [updateSettings],
  );

  const handleStartEditDefaultDescription = useCallback(
    (index: number) => {
      setEditingDefaultDescIndex(index);
    },
    [],
  );

  const handleStartEditDescription = useCallback(
    (index: number) => {
      setEditingDescIndex(index);
    },
    [],
  );

  // ── Add folder handlers ──
  const handleAddCurrent = () => {
    const trimmed = newCurrentName.trim();
    if (!trimmed) {
      toast.error("Folder name is required.");
      return;
    }
    const err = addFolder(newCurrentFunc, trimmed);
    if (err) {
      toast.error(err);
      return;
    }
    setNewCurrentName("");
    setAddingCurrent(false);
  };

  const handleAddDefaults = () => {
    const trimmed = newDefaultsName.trim();
    if (!trimmed) {
      toast.error("Folder name is required.");
      return;
    }
    // Validate duplicate names in defaults
    const isCaseInsensitiveFs =
      typeof navigator !== "undefined" &&
      (navigator.platform.startsWith("Mac") || navigator.platform.startsWith("Win"));
    const isDuplicate = defaultDirs.some((d) =>
      isCaseInsensitiveFs
        ? d.name.toLowerCase() === trimmed.toLowerCase()
        : d.name === trimmed,
    );
    if (isDuplicate) {
      toast.error(`A folder named "${trimmed}" already exists.`);
      return;
    }
    if (newDefaultsFunc === "manuscript" && hasDefaultManuscript) {
      toast.error("Only one manuscript folder is allowed.");
      return;
    }
    const entry = createDefaultFolder(trimmed, newDefaultsFunc);
    updateSettings({ defaultWorkspaceDirs: [...defaultDirs, entry] });
    setNewDefaultsName("");
    setAddingDefaults(false);
  };

  // ── Defaults folder change handler ──
  const handleDefaultsChange = (index: number, patch: Partial<WorkspaceFolder>) => {
    const current = defaultDirs[index];
    if (!current) return;

    // Validate name changes
    if (patch.name !== undefined) {
      const newName = patch.name;
      if (!newName.trim()) { toast.error("Folder name cannot be empty."); return; }
      if (newName.includes("/") || newName.includes("\\")) { toast.error(`Folder name "${newName}" cannot contain path separators.`); return; }
      if (newName === "." || newName === "..") { toast.error(`Folder name "${newName}" is reserved.`); return; }
      const isDup = defaultDirs.some((d, i) =>
        i !== index &&
        (d.name.toLowerCase() === newName.toLowerCase()
          ? true
          : d.name === newName)
      );
      if (isDup) { toast.error(`A folder named "${newName}" already exists.`); return; }
    }

    // Enforce manuscript uniqueness
    if (
      patch.function === "manuscript" &&
      current.function !== "manuscript" &&
      defaultDirs.some((d, i) => i !== index && d.function === "manuscript")
    ) {
      toast.error("Only one manuscript folder is allowed.");
      return;
    }

    const updated = defaultDirs.map((d, i) =>
      i === index ? ({ ...d, ...patch } as WorkspaceFolder) : d,
    );
    updateSettings({ defaultWorkspaceDirs: updated });
  };

  const handleDefaultsDelete = (index: number) => {
    setDeleteTarget("defaults");
    setDeleteIndex(index);
  };

  // ── Delete confirmation ──
  const folderToDelete =
    deleteIndex != null && deleteTarget === "current"
      ? workspaceDirs[deleteIndex]
      : deleteIndex != null && deleteTarget === "defaults"
        ? defaultDirs[deleteIndex]
        : null;
  const isOnlyManuscript =
    folderToDelete?.function === "manuscript" &&
    (deleteTarget === "current"
      ? workspaceDirs.filter((d) => d.function === "manuscript").length === 1
      : defaultDirs.filter((d) => d.function === "manuscript").length === 1);

  const confirmDelete = () => {
    if (deleteIndex == null) return;
    if (deleteTarget === "current") {
      removeFolder(deleteIndex);
    } else {
      const updated = defaultDirs.filter((_, i) => i !== deleteIndex);
      updateSettings({ defaultWorkspaceDirs: updated });
    }
    setDeleteIndex(null);
    setDeleteTarget(null);
  };

  // ── Bridge: apply current as defaults ──
  const handleApplyAsDefaults = () => {
    updateSettings({ defaultWorkspaceDirs: [...workspaceDirs] });
    toast.success("Current workspace configuration applied as defaults for new projects.", {
      duration: 3000,
    });
  };

  // ── Defaults reset folder to default ──
  const handleResetDefaultFolder = (index: number) => {
    const folder = defaultDirs[index];
    if (!folder) return;
    const reset = createDefaultFolder(folder.name, folder.function);
    const updated = defaultDirs.map((d, i) => (i === index ? reset : d));
    updateSettings({ defaultWorkspaceDirs: updated });
  };

  // ── Render helper: folder list ──
  const renderFolderList = (
    dirs: WorkspaceFolder[],
    hasManuscript: boolean,
    onChange: (index: number, patch: Partial<WorkspaceFolder>) => void,
    onDelete: (index: number) => void,
    onStartEditDesc: (index: number) => void,
    editingIdx: number | null,
    saveDesc: (value: string) => void,
    cancelDesc: () => void,
    onReset?: (index: number) => void,
  ) => {
    if (dirs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <FolderIcon className="size-6 text-muted-foreground/20 mb-2" />
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            No folders configured
          </p>
          <p className="text-[length:var(--font-size-11)] text-muted-foreground/50 mt-0.5">
            Add a folder below to get started.
          </p>
        </div>
      );
    }

    return dirs.map((folder, i) => (
      <FolderRow
        key={`${folder.function}:${folder.name}`}
        folder={folder}
        index={i}
        hasExistingManuscript={hasManuscript}
        onChange={onChange}
        onRequestDelete={onDelete}
        isEditingDescription={editingIdx === i}
        onStartEditDescription={() => onStartEditDesc(i)}
        onSaveDescription={(value) => saveDesc(value)}
        onCancelEditDescription={cancelDesc}
        onReset={onReset ? () => onReset(i) : undefined}
      />
    ));
  };

  // ── Loading state – only when a project IS open but config hasn't loaded ──
  // When no project is open, the Defaults section (settingsStore) works independently.
  if (projectRoot && !loaded) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
          <p className="text-[length:var(--font-size-12)] text-muted-foreground">
            Loading workspace configuration...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        {/* ── Header ── */}
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            Workspace
          </h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            Configure which folders make up your research workspace. AI agents
            read folder purposes and descriptions to understand your project
            structure.
          </p>
        </div>

        {/* ═══ CURRENT PROJECT ═══ */}
        {projectRoot && (
          <div>
            <h3 className={CATEGORY_HEADER}>Current Project</h3>
            <div className={CARD}>
              {renderFolderList(
                workspaceDirs,
                hasExistingManuscript,
                handleCurrentChange,
                (idx) => {
                  setDeleteTarget("current");
                  setDeleteIndex(idx);
                },
                handleStartEditDescription,
                editingDescIndex,
                (value: string) => handleSaveDescription(editingDescIndex!, value),
                handleCancelEditDescription,
              )}

              {/* Add folder row */}
              <div className="px-4 py-2">
                {addingCurrent ? (
                  <div className="flex items-center gap-2.5">
                    <Select
                      value={newCurrentFunc}
                      onValueChange={(v) => setNewCurrentFunc(v as FolderFunction)}
                    >
                      <SelectTrigger className={cn("w-[110px]", TRIGGER)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="!p-0.5">
                        {FOLDER_FUNCTIONS.map((f) => {
                          const disabled =
                            f === "manuscript" && hasExistingManuscript;
                          return (
                            <SelectItem
                              key={f}
                              value={f}
                              disabled={disabled}
                              className="!py-1 !text-[length:var(--font-size-11)]"
                            >
                              {FOLDER_FUNCTION_LABELS[f]}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 h-6 px-2 rounded-md border border-input bg-background">
                      <FolderIcon className="size-3 shrink-0 text-muted-foreground/50" />
                      <input
                        className="h-full w-[100px] bg-transparent text-[length:var(--font-size-12)] text-foreground outline-none"
                        value={newCurrentName}
                        onChange={(e) => setNewCurrentName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddCurrent();
                          if (e.key === "Escape") {
                            setAddingCurrent(false);
                            setNewCurrentName("");
                          }
                        }}
                        placeholder="folder-name"
                        autoFocus
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[length:var(--font-size-11)]"
                      onClick={handleAddCurrent}
                    >
                      Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[length:var(--font-size-11)] text-muted-foreground"
                      onClick={() => {
                        setAddingCurrent(false);
                        setNewCurrentName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    className="flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-size-11)] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    onClick={() => setAddingCurrent(true)}
                  >
                    <PlusIcon className="size-3" />
                    Add folder
                  </button>
                )}
              </div>
            </div>
            <p className="text-[length:var(--font-size-10)] text-muted-foreground text-center mt-2">
              Only one <strong>manuscript</strong> folder is allowed. Changes
              auto-save.
            </p>
          </div>
        )}

        {/* ═══ BRIDGE ═══ */}
        {projectRoot && (
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="h-px w-14 bg-border" />
              <button
                className="flex items-center gap-1.5 h-6 px-3 rounded-md border border-border bg-background text-[length:var(--font-size-11)] text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 transition-colors"
                onClick={handleApplyAsDefaults}
              >
                <span className="text-[length:var(--font-size-10)]">↓</span>
                Apply current as defaults
                <span className="text-[length:var(--font-size-10)]">↓</span>
              </button>
              <div className="h-px w-14 bg-border" />
            </div>
          </div>
        )}

        {/* ═══ DEFAULTS FOR NEW PROJECTS ═══ */}
        <div>
          <h3 className={CATEGORY_HEADER}>Defaults for New Projects</h3>
          <div className={CARD}>
            {renderFolderList(
              defaultDirs,
              hasDefaultManuscript,
              handleDefaultsChange,
              handleDefaultsDelete,
              handleStartEditDefaultDescription,
              editingDefaultDescIndex,
              (value: string) => handleSaveDefaultDescription(editingDefaultDescIndex!, value),
              () => setEditingDefaultDescIndex(null),
              handleResetDefaultFolder,
            )}

            {/* Add folder row */}
            <div className="px-4 py-2">
              {addingDefaults ? (
                <div className="flex items-center gap-2.5">
                  <Select
                    value={newDefaultsFunc}
                    onValueChange={(v) => setNewDefaultsFunc(v as FolderFunction)}
                  >
                    <SelectTrigger className={cn("w-[110px]", TRIGGER)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="!p-0.5">
                      {FOLDER_FUNCTIONS.map((f) => {
                        const disabled =
                          f === "manuscript" && hasDefaultManuscript;
                        return (
                          <SelectItem
                            key={f}
                            value={f}
                            disabled={disabled}
                            className="!py-1 !text-[length:var(--font-size-11)]"
                          >
                            {FOLDER_FUNCTION_LABELS[f]}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 h-6 px-2 rounded-md border border-input bg-background">
                    <FolderIcon className="size-3 shrink-0 text-muted-foreground/50" />
                    <input
                      className="h-full w-[100px] bg-transparent text-[length:var(--font-size-12)] text-foreground outline-none"
                      value={newDefaultsName}
                      onChange={(e) => setNewDefaultsName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddDefaults();
                        if (e.key === "Escape") {
                          setAddingDefaults(false);
                          setNewDefaultsName("");
                        }
                      }}
                      placeholder="folder-name"
                      autoFocus
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[length:var(--font-size-11)]"
                    onClick={handleAddDefaults}
                  >
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[length:var(--font-size-11)] text-muted-foreground"
                    onClick={() => {
                      setAddingDefaults(false);
                      setNewDefaultsName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 h-6 px-2 rounded text-[length:var(--font-size-11)] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setAddingDefaults(true)}
                >
                  <PlusIcon className="size-3" />
                  Add folder
                </button>
              )}
            </div>

            {/* Default template — only when manuscript exists in defaults */}
            {hasDefaultManuscript && (
              <div className="px-4 py-2.5 flex items-center justify-between group">
                <div>
                  <p className={ROW_LABEL}>Default template</p>
                  <p className={ROW_DESC}>
                    Document class for auto-generated main.tex
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    className={RESET_ICON}
                    onClick={() =>
                      updateSettings({ defaultDocClass: "article" })
                    }
                    title="Reset to default"
                  >
                    <RotateCcwIcon className="size-3" />
                  </button>
                  <Select
                    value={settings.defaultDocClass ?? "article"}
                    onValueChange={(v) =>
                      updateSettings({
                        defaultDocClass: v as "article" | "report" | "book",
                      })
                    }
                  >
                    <SelectTrigger className={cn("w-24", TRIGGER)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="!p-0.5">
                      <SelectItem
                        value="article"
                        className="!py-1 !text-[length:var(--font-size-11)]"
                      >
                        Article
                      </SelectItem>
                      <SelectItem
                        value="report"
                        className="!py-1 !text-[length:var(--font-size-11)]"
                      >
                        Report
                      </SelectItem>
                      <SelectItem
                        value="book"
                        className="!py-1 !text-[length:var(--font-size-11)]"
                      >
                        Book
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <p className="text-[length:var(--font-size-10)] text-muted-foreground mt-2">
            Defaults are applied to new projects. Existing projects are
            unaffected. main.tex is always auto-created when a manuscript folder
            is present.
          </p>
        </div>

        {/* ═══ Delete Confirmation Dialog ═══ */}
        <Dialog
          open={deleteIndex != null}
          onOpenChange={(o) => {
            if (!o) {
              setDeleteIndex(null);
              setDeleteTarget(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remove Workspace Folder</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2">
                  <p className="text-sm">
                    Are you sure you want to remove{" "}
                    <strong>
                      &ldquo;{folderToDelete?.name || "this folder"}&rdquo;
                    </strong>{" "}
                    ({folderToDelete ? FOLDER_FUNCTION_LABELS[folderToDelete.function] : ""})
                    from the{" "}
                    {deleteTarget === "defaults"
                      ? "defaults configuration"
                      : "workspace configuration"}
                    ?
                  </p>
                  {isOnlyManuscript && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      This is the only manuscript folder. Removing it will
                      disable TeX workspace features (editor + PDF preview).
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    The folder and its contents on disk will not be deleted —
                    only the configuration entry is removed.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteIndex(null);
                  setDeleteTarget(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
