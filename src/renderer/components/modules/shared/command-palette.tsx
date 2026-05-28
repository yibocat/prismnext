import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Bot,
  PenLine,
  PanelLeft,
  PanelRight,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem>
            <Bot className="size-4" />
            <span>New Agent</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <PenLine className="size-4" />
            <span>TeX Workspace</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Panels">
          <CommandItem>
            <PanelLeft className="size-4" />
            <span>Toggle Left Sidebar</span>
          </CommandItem>
          <CommandItem>
            <PanelRight className="size-4" />
            <span>Toggle Right Area</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem>
            <SearchIcon className="size-4" />
            <span>Search Files</span>
          </CommandItem>
          <CommandItem>
            <SettingsIcon className="size-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
