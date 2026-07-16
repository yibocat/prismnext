// src/renderer/components/modules/chat/agent-settings/permission-mode-select.tsx
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useSettingsStore } from "@/stores/settings-store";
import {
  DEFAULT_PERMISSION_MODE,
  PERMISSION_MODE_OPTIONS,
  type PermissionMode,
} from "@shared/permission-modes";
import {
  ChevronDownIcon,
  EyeIcon,
  FilePenLineIcon,
  ShieldQuestionIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PERMISSION_MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  ask: ShieldQuestionIcon,
  edit_auto: FilePenLineIcon,
  auto: ZapIcon,
  readonly: EyeIcon,
};

interface PermissionModeSelectProps {
  compact?: boolean;
}

export function PermissionModeSelect({ compact }: PermissionModeSelectProps) {
  const permissionMode =
    useSettingsStore((s) => s.settings.permissionMode) ?? DEFAULT_PERMISSION_MODE;
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const current =
    PERMISSION_MODE_OPTIONS.find((o) => o.value === permissionMode) ??
    PERMISSION_MODE_OPTIONS[0];
  const CurrentIcon = PERMISSION_MODE_ICONS[current.value];

  const handleSelect = (mode: PermissionMode) => {
    updateSettings({ permissionMode: mode });
  };

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-[length:var(--font-chat-meta)] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            compact && "size-7 justify-center px-0",
          )}
          title={`Permission mode: ${current.label}`}
        >
          <CurrentIcon className="size-3.5 shrink-0" />
          {!compact && (
            <>
              <span>{current.shortLabel}</span>
              <ChevronDownIcon className="size-3 shrink-0" />
            </>
          )}
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="end" className="w-64">
        <AppMenuLabel>Permission Mode</AppMenuLabel>
        {PERMISSION_MODE_OPTIONS.map((option) => (
          <AppMenuCheckItem
            key={option.value}
            selected={permissionMode === option.value}
            description={option.description}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </AppMenuCheckItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
