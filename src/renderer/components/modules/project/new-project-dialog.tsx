import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/types/workspace";
import { defaultFolderIcon } from "@/lib/workspace/folder-icons";
import { WorkspaceFolderIcon } from "@/lib/workspace/workspace-folder-icon";
import {
  FolderOpenIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

interface NewProjectDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewProjectDialog({ children, open: controlledOpen, onOpenChange }: NewProjectDialogProps) {
  const addRecentProject = useProjectStore((s) => s.addRecentProject);
  const openProject = useDocumentStore((s) => s.openProject);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [parentPath, setParentPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  interface NewFolderEntry {
    name: string;
    function: FolderFunction;
  }

  const appDefaults = useSettingsStore((s) => s.settings.defaultWorkspaceDirs);
  const initialFolders: NewFolderEntry[] = (appDefaults && appDefaults.length > 0)
    ? appDefaults.map(d => ({ name: d.name, function: d.function as FolderFunction }))
    : [{ name: "manuscript", function: "manuscript" as FolderFunction }];
  const [workspaceFolders, setWorkspaceFolders] = useState<NewFolderEntry[]>(initialFolders);

  const inputRef = useRef<HTMLInputElement>(null);

  const fullPath = parentPath && projectName.trim()
    ? `${parentPath}/${projectName.trim()}`
    : "";

  useEffect(() => {
    if (open) {
      // Focus input after dialog animation
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
    // Reset on close
    setParentPath("");
    setProjectName("");
    setCreating(false);
    setWorkspaceFolders(initialFolders);
  }, [open]);

  const handleSelectParent = async () => {
    const result = await window.electronAPI.dialogOpenFolder();
    if (!result.canceled && result.path) setParentPath(result.path);
  };

  const handleCreate = async () => {
    if (!fullPath) return;
    setCreating(true);
    try {
      // Build workspace dirs from the dialog form
      const workspaceDirs = workspaceFolders
        .filter((f) => f.name.trim())
        .map((f) => {
          if (f.function === "manuscript") {
            return { function: "manuscript" as const, name: f.name.trim(), mainTex: "main.tex" };
          }
          return { function: f.function, name: f.name.trim() };
        });

      // Pass workspaceDirs directly — folders are created inside projectCreate
      await window.electronAPI.projectCreate(
        fullPath,
        workspaceDirs.length > 0 ? workspaceDirs as any : undefined,
      );

      addRecentProject(fullPath);
      setOpen(false);
      await openProject(fullPath);
    } catch (err) {
      setCreating(false);
      const message = err instanceof Error ? err.message : "Failed to create project";
      console.error("Project creation failed:", err);
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="text-[length:var(--font-dialog-title)]">New Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project name */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-dialog-label)] font-medium text-muted-foreground">
              Project name
            </label>
            <Input
              ref={inputRef}
              className="text-[length:var(--font-input)]"
              placeholder="my-paper"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={creating}
            />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-[length:var(--font-dialog-label)] font-medium text-muted-foreground">
              Location
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 min-w-0 rounded-md border border-input bg-transparent px-3 py-1.5 text-[length:var(--font-input)] text-muted-foreground hover:bg-muted transition-colors text-left"
                onClick={handleSelectParent}
              >
                <FolderOpenIcon className="size-3.5 shrink-0 opacity-60" />
                <span className="truncate">
                  {parentPath ? parentPath.split("/").pop() || parentPath : "Select folder..."}
                </span>
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectParent}
                className="shrink-0"
              >
                Browse
              </Button>
            </div>
          </div>

          {/* Workspace folders */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <label className="text-[length:var(--font-dialog-label)] font-medium text-muted-foreground">
                Workspace Folders
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setWorkspaceFolders((prev) => [
                    ...prev,
                    { name: "", function: "literature" },
                  ])
                }
              >
                <PlusIcon className="size-3 mr-1" />
                Add
              </Button>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <div className="w-[110px]">Name</div>
                <div className="w-[100px]">Function</div>
                <div className="flex-1" />
                <div className="w-[24px]" />
              </div>
              {/* Rows */}
              {workspaceFolders.map((f, i) => {
                const hasManuscript = workspaceFolders.some(
                  (x, j) => x.function === "manuscript" && j !== i,
                );
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 border-t border-border"
                  >
                    <div className="w-[110px]">
                      <Input
                        className="h-7 text-xs"
                        placeholder="name"
                        value={f.name}
                        onChange={(e) => {
                          const next = [...workspaceFolders];
                          next[i] = { ...next[i], name: e.target.value };
                          setWorkspaceFolders(next);
                        }}
                      />
                    </div>
                    <div className="w-[100px]">
                      <Select
                        value={f.function}
                        onValueChange={(v) => {
                          const next = [...workspaceFolders];
                          next[i] = { ...next[i], function: v as FolderFunction };
                          setWorkspaceFolders(next);
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FOLDER_FUNCTIONS.map((fn) => (
                            <SelectItem
                              key={fn}
                              value={fn}
                              disabled={fn === "manuscript" && hasManuscript}
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <WorkspaceFolderIcon name={defaultFolderIcon(fn)} className="size-3.5" />
                                {FOLDER_FUNCTION_LABELS[fn]}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1" />
                    <div className="w-[24px] flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setWorkspaceFolders((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Path preview */}
          {parentPath && projectName.trim() && (
            <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-[length:var(--font-path)] text-muted-foreground/60 font-mono truncate">
              <ChevronRightIcon className="size-3 shrink-0 opacity-40" />
              {fullPath}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={creating}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!projectName.trim() || !parentPath || creating}
            onClick={handleCreate}
          >
            {creating ? (
              <><Loader2Icon className="size-3.5 animate-spin" /> Creating...</>
            ) : (
              "Create Project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
