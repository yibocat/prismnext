import { useState } from "react";
import { RotateCcwIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  FOLDER_ICON_CATEGORIES,
  defaultFolderIcon,
  type LucideIconName,
} from "@/lib/workspace/folder-icons";
import {
  WorkspaceFolderIcon,
  resolveFolderIconForFunction,
} from "@/lib/workspace/workspace-folder-icon";
import type { FolderFunction } from "@/types/workspace";

interface WorkspaceFolderIconPickerProps {
  value: string;
  folderFunction: FolderFunction;
  onChange: (iconName: string) => void;
  disabled?: boolean;
}

export function WorkspaceFolderIconPicker({
  value,
  folderFunction,
  onChange,
  disabled,
}: WorkspaceFolderIconPickerProps) {
  const [open, setOpen] = useState(false);
  const displayName = resolveFolderIconForFunction(value, folderFunction);
  const isCustom = Boolean(value.trim() && value.trim() !== defaultFolderIcon(folderFunction));

  const pick = (name: LucideIconName) => {
    onChange(name);
    setOpen(false);
  };

  const reset = () => {
    onChange("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-muted/20",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          title="Choose folder badge icon"
        >
          <WorkspaceFolderIcon name={displayName} className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[364px] p-0">
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <p className="text-[length:var(--font-size-12)] font-medium text-foreground/90">
            Folder badge
          </p>
          <button
            type="button"
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[length:var(--font-size-11)] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            title="Reset to type default"
            onClick={reset}
          >
            <RotateCcwIcon className="size-3" />
            Default
          </button>
        </div>
        <div className="max-h-[380px] overflow-y-auto overscroll-contain">
          {FOLDER_ICON_CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <div className="sticky top-0 z-10 border-b border-border/50 bg-popover px-3 py-1 text-[length:var(--font-size-12)] font-medium text-muted-foreground backdrop-blur-sm">
                {cat.label}
              </div>
              <div className="grid grid-cols-8 gap-px px-1.5 py-1.5">
                {cat.icons.map((iconName) => {
                  const selected = displayName === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      className={cn(
                        "flex items-center justify-center rounded-sm h-8 transition-colors",
                        selected
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "hover:bg-accent text-muted-foreground hover:text-accent-foreground",
                      )}
                      title={iconName}
                      onClick={() => pick(iconName)}
                    >
                      <WorkspaceFolderIcon name={iconName} className="size-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {isCustom ? (
          <p className="border-t border-border/50 px-3 py-2 text-[length:var(--font-size-11)] text-muted-foreground">
            Custom: <span className="font-mono text-foreground/80">{displayName}</span>
          </p>
        ) : (
          <p className="border-t border-border/50 px-3 py-2 text-[length:var(--font-size-11)] text-muted-foreground">
            Using default for this folder type:{" "}
            <span className="font-mono text-foreground/80">{displayName}</span>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
