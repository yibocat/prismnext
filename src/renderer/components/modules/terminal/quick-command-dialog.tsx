import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { TerminalQuickCommand } from "@/types/terminal";

// ─── Types ───

interface QuickCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (label: string, command: string, description?: string) => void;
  /** If editing an existing command, pass it here. */
  editCommand?: TerminalQuickCommand | null;
}

// ─── Component ───

export function QuickCommandDialog({
  open,
  onOpenChange,
  onSave,
  editCommand,
}: QuickCommandDialogProps) {
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [description, setDescription] = useState("");

  // Reset / populate form when opened
  useEffect(() => {
    if (open) {
      if (editCommand) {
        setLabel(editCommand.label);
        setCommand(editCommand.command);
        setDescription(editCommand.description ?? "");
      } else {
        setLabel("");
        setCommand("");
        setDescription("");
      }
    }
  }, [open, editCommand]);

  const handleSave = useCallback(() => {
    const trimmedLabel = label.trim();
    const trimmedCommand = command.trim();
    if (!trimmedLabel || !trimmedCommand) return;
    onSave(trimmedLabel, trimmedCommand, description.trim() || undefined);
    onOpenChange(false);
  }, [label, command, description, onSave, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {editCommand ? "Edit Command" : "Add Quick Command"}
          </DialogTitle>
          <DialogDescription>
            Save a frequently-used shell command for quick access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2" onKeyDown={handleKeyDown}>
          {/* Label */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Git Status"
              className="h-8 rounded-md border border-border bg-background px-2.5 text-[length:var(--font-size-13)] text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          {/* Command */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              Command
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. git status"
              rows={3}
              className="resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[length:var(--font-size-13)] font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              Description{" "}
              <span className="text-muted-foreground/60 font-normal">
                (optional)
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this command does"
              className="h-8 rounded-md border border-border bg-background px-2.5 text-[length:var(--font-size-13)] text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-md border border-border bg-background px-3 text-[length:var(--font-size-13)] text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!label.trim() || !command.trim()}
            className="h-8 rounded-md bg-primary px-3 text-[length:var(--font-size-13)] text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
