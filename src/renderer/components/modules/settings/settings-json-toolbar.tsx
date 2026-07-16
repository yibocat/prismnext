import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  MARKDOWN_SUBTOOLBAR_CLASS,
  MARKDOWN_TOOLBAR_PRIMARY_BTN,
  MARKDOWN_TOOLBAR_TEXT_BTN,
} from "@/components/modules/editor/toolbars/markdown-toolbar";
import { cn } from "@/lib/utils";

export function SettingsJsonToolbar({
  primaryLabel,
  onPrimary,
  onCancel,
  disabled,
  saving,
  trailing,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  onCancel: () => void;
  disabled?: boolean;
  saving?: boolean;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={MARKDOWN_SUBTOOLBAR_CLASS}>
      <button
        type="button"
        className={cn(MARKDOWN_TOOLBAR_PRIMARY_BTN, saving && "opacity-70")}
        disabled={disabled || saving}
        onClick={onPrimary}
      >
        {saving ? t("common.loading") : primaryLabel}
      </button>
      <button
        type="button"
        className={MARKDOWN_TOOLBAR_TEXT_BTN}
        disabled={saving}
        onClick={onCancel}
      >
        {t("common.cancel")}
      </button>
      <div className="flex-1 min-w-0" />
      {trailing}
    </div>
  );
}
