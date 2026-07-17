import { useTranslation } from "react-i18next";
import {
  MarkdownToolbarControls,
  MARKDOWN_SUBTOOLBAR_CLASS,
  MARKDOWN_TOOLBAR_TEXT_BTN,
  MARKDOWN_TOOLBAR_PRIMARY_BTN,
} from "@/components/modules/editor/toolbars/markdown-toolbar";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";

export type SettingsMarkdownToolbarActions = {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  /** Restore built-in default prompt — text button, left of width control. */
  onResetToDefault?: () => void;
  resetDisabled?: boolean;
};

export function SettingsMarkdownToolbar({
  viewMode,
  onViewModeChange,
  readOnly = false,
  onRefresh,
  refreshing = false,
  actions,
}: {
  viewMode: "source" | "preview";
  onViewModeChange?: (mode: "source" | "preview") => void;
  readOnly?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: SettingsMarkdownToolbarActions;
}) {
  const { t } = useTranslation();
  return (
    <div className={MARKDOWN_SUBTOOLBAR_CLASS}>
      {actions ? (
        <>
          <button
            type="button"
            className={cn(MARKDOWN_TOOLBAR_PRIMARY_BTN, actions.saving && "opacity-70")}
            disabled={actions.saving}
            onClick={actions.onSave}
          >
            {actions.saving ? t("common.saving") : t("common.save")}
          </button>
          <button
            type="button"
            className={MARKDOWN_TOOLBAR_TEXT_BTN}
            disabled={actions.saving}
            onClick={actions.onCancel}
          >
            {t("common.cancel")}
          </button>
        </>
      ) : null}

      <div className="flex-1 min-w-0" />

      {actions?.onResetToDefault ? (
        <Hint label={t("settings.appearance.resetDefault")}>
          <button
            type="button"
            className={MARKDOWN_TOOLBAR_TEXT_BTN}
            disabled={actions.resetDisabled || actions.saving}
            onClick={actions.onResetToDefault}
          >
            {t("settings.appearance.resetDefault")}
          </button>
        </Hint>
      ) : null}

      <MarkdownToolbarControls
        viewMode={viewMode}
        onViewModeChange={readOnly ? undefined : onViewModeChange}
        showViewToggle={!readOnly}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    </div>
  );
}
