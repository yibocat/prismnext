import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompileStore } from "@/stores/compile-store";
import { Switch } from "@/components/ui/switch";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

export function CompileSettingsFields() {
  const { t } = useTranslation();
  const compilerBackend = useCompileStore((s) => s.compilerBackend);
  const setCompilerBackend = useCompileStore((s) => s.setCompilerBackend);
  const autoCompile = useCompileStore((s) => s.autoCompile);
  const toggleAutoCompile = useCompileStore((s) => s.toggleAutoCompile);
  const compilerStatus = useCompileStore((s) => s.compilerStatus);
  const detectCompilers = useCompileStore((s) => s.detectCompilers);

  useEffect(() => {
    void detectCompilers();
  }, [detectCompilers]);

  return (
    <div className={SETTINGS_CARD}>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.compile.defaultEngine")}</span>
          <p className={SETTINGS_ROW_DESC}>
            {t("settings.texWorkspacePage.compile.defaultEngineDesc")}
          </p>
        </div>
        <AppSelect value={compilerBackend} onValueChange={(v) => setCompilerBackend(v as "tectonic" | "texlive")}>
          <AppSelectTrigger className="w-28">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="tectonic" disabled={!compilerStatus?.tectonic}>Tectonic</AppSelectItem>
            <AppSelectItem value="texlive" disabled={!compilerStatus?.texlive.available}>
              {compilerStatus?.texlive.engines?.[0] || "TeXLive"}
            </AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.texWorkspacePage.compile.autoCompile")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.texWorkspacePage.compile.autoCompileDesc")}</p>
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
