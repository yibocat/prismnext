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
import {
  FolderOpenIcon,
  ChevronRightIcon,
  Loader2Icon,
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
  }, [open]);

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
      setOpen(false);
      await openProject(fullPath);
    } catch {
      setCreating(false);
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
