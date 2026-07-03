import type { ReactNode } from "react";
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
  return (
    <div className={MARKDOWN_SUBTOOLBAR_CLASS}>
      <button
        type="button"
        className={cn(MARKDOWN_TOOLBAR_PRIMARY_BTN, saving && "opacity-70")}
        disabled={disabled || saving}
        onClick={onPrimary}
      >
        {saving ? "Working…" : primaryLabel}
      </button>
      <button
        type="button"
        className={MARKDOWN_TOOLBAR_TEXT_BTN}
        disabled={saving}
        onClick={onCancel}
      >
        Cancel
      </button>
      <div className="flex-1 min-w-0" />
      {trailing}
    </div>
  );
}
