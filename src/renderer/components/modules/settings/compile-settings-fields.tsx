import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompileStore } from "@/stores/compile-store";
import { Switch } from "@/components/ui/switch";
import {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

export function CompileSettingsFields() {
  const { t } = useTranslation();
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);

  return (
    <div className={SETTINGS_CARD}>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.compiler.autoCompile")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.compiler.autoCompileDesc")}</p>
        </div>
        <Switch
          checked={autoCompile}
          onCheckedChange={(checked) => {
            if (checked !== autoCompile) toggleAutoCompile();
          }}
        />
      </div>
    </div>
  );
}
