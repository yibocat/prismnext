import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  const { t } = useTranslation();
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
            {editCommand
              ? t("terminal.quickCommand.edit")
              : t("terminal.quickCommand.add")}
          </DialogTitle>
          <DialogDescription>
            {t("terminal.quickCommand.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2" onKeyDown={handleKeyDown}>
          {/* Label */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("terminal.quickCommand.label")}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("terminal.quickCommand.labelPlaceholder")}
              className="h-8 rounded-md border border-border bg-background px-2.5 font-sans text-[length:var(--font-size-12)] text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoFocus
            />
          </div>

          {/* Command */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("terminal.quickCommand.command")}
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("terminal.quickCommand.commandPlaceholder")}
              rows={3}
              className="resize-none rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[length:var(--font-size-12)] text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[length:var(--font-size-12)] font-medium text-foreground">
              {t("terminal.quickCommand.description")}{" "}
              <span className="text-muted-foreground/60 font-normal">
                {t("terminal.quickCommand.optional")}
              </span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("terminal.quickCommand.descPlaceholder")}
              className="h-8 rounded-md border border-border bg-background px-2.5 font-sans text-[length:var(--font-size-12)] text-foreground placeholder:text-muted-foreground/50 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="xs"
            onClick={handleSave}
            disabled={!label.trim() || !command.trim()}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
