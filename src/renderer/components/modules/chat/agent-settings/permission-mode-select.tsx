// src/renderer/components/modules/chat/agent-settings/permission-mode-select.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/stores/settings-store";
import {
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODE_OPTIONS,
  type PermissionMode,
} from "@shared/permission-modes";
import { CheckIcon, ChevronDownIcon, ShieldIcon } from "lucide-react";

export function PermissionModeSelect() {
  const permissionMode =
    useSettingsStore((s) => s.settings.permissionMode) ?? DEFAULT_PERMISSION_MODE;
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const current =
    PERMISSION_MODE_OPTIONS.find((o) => o.value === permissionMode) ??
    PERMISSION_MODE_OPTIONS[0];

  const handleSelect = (mode: PermissionMode) => {
    updateSettings({ permissionMode: mode });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={`Permission mode: ${current.label}`}
        >
          <ShieldIcon className="size-3 shrink-0" />
          <span>{current.shortLabel}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1 font-medium text-muted-foreground text-[length:var(--font-chat-meta)]">
          Permission Mode
        </div>
        {PERMISSION_MODE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelect(option.value)}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[length:var(--font-chat-meta)]">{option.label}</span>
              <span className="text-[length:var(--font-size-11)] text-muted-foreground/70 leading-snug">
                {option.description}
              </span>
            </div>
            {permissionMode === option.value && (
              <CheckIcon className="size-3 shrink-0 ml-2" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
