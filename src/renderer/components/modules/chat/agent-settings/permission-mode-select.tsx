// src/renderer/components/modules/chat/agent-settings/permission-mode-select.tsx
import { useTranslation } from "react-i18next";
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
import { Hint } from "@/components/ui/hint";
import { COMPOSER_TOOLBAR_TRIGGER } from "../worktree-selector";

const PERMISSION_MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  ask: ShieldQuestionIcon,
  edit_auto: FilePenLineIcon,
  auto: ZapIcon,
  readonly: EyeIcon,
};

const PERMISSION_I18N: Record<
  PermissionMode,
  { label: string; short: string; desc: string }
> = {
  ask: {
    label: "chat.permission.ask",
    short: "chat.permission.askShort",
    desc: "chat.permission.askDesc",
  },
  edit_auto: {
    label: "chat.permission.editAuto",
    short: "chat.permission.editAutoShort",
    desc: "chat.permission.editAutoDesc",
  },
  auto: {
    label: "chat.permission.auto",
    short: "chat.permission.autoShort",
    desc: "chat.permission.autoDesc",
  },
  readonly: {
    label: "chat.permission.readonly",
    short: "chat.permission.readonlyShort",
    desc: "chat.permission.readonlyDesc",
  },
};

interface PermissionModeSelectProps {
  compact?: boolean;
}

export function PermissionModeSelect({ compact }: PermissionModeSelectProps) {
  const { t } = useTranslation();
  const permissionMode =
    useSettingsStore((s) => s.settings.permissionMode) ?? DEFAULT_PERMISSION_MODE;
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const current =
    PERMISSION_MODE_OPTIONS.find((o) => o.value === permissionMode) ??
    PERMISSION_MODE_OPTIONS[0];
  const CurrentIcon = PERMISSION_MODE_ICONS[current.value];
  const currentKeys = PERMISSION_I18N[current.value];

  const handleSelect = (mode: PermissionMode) => {
    updateSettings({ permissionMode: mode });
  };

  return (
    <AppMenu>
      <Hint label={t("chat.permission.modeTitle", { mode: t(currentKeys.label) })}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              COMPOSER_TOOLBAR_TRIGGER,
              compact && "size-6 justify-center px-0",
            )}
          >
            <CurrentIcon className="size-3 shrink-0" />
            {!compact && (
              <>
                <span>{t(currentKeys.short)}</span>
                <ChevronDownIcon className="size-3 shrink-0" />
              </>
            )}
          </button>
        </AppMenuTrigger>
      </Hint>
      <AppMenuContent align="end" className="w-64">
        <AppMenuLabel>{t("chat.permission.label")}</AppMenuLabel>
        {PERMISSION_MODE_OPTIONS.map((option) => {
          const keys = PERMISSION_I18N[option.value];
          return (
            <AppMenuCheckItem
              key={option.value}
              selected={permissionMode === option.value}
              description={t(keys.desc)}
              onClick={() => handleSelect(option.value)}
            >
              {t(keys.label)}
            </AppMenuCheckItem>
          );
        })}
      </AppMenuContent>
    </AppMenu>
  );
}
