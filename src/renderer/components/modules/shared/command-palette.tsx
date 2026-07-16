import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("shell.commandPalettePlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("shell.commandPaletteEmpty")}</CommandEmpty>
        <CommandGroup heading={t("shell.command.actions")}>
          <CommandItem>
            <Bot className="size-4" />
            <span>{t("shell.newAgent")}</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <PenLine className="size-4" />
            <span>{t("nav.texWorkspace")}</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("shell.command.panels")}>
          <CommandItem>
            <PanelLeft className="size-4" />
            <span>{t("shell.command.toggleLeftSidebar")}</span>
          </CommandItem>
          <CommandItem>
            <PanelRight className="size-4" />
            <span>{t("shell.command.toggleRightArea")}</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("shell.command.navigation")}>
          <CommandItem>
            <SearchIcon className="size-4" />
            <span>{t("shell.command.searchFiles")}</span>
          </CommandItem>
          <CommandItem>
            <SettingsIcon className="size-4" />
            <span>{t("nav.settings")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
