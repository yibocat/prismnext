import { CompileSettingsFields } from "./compile-settings-fields";
import { useTranslation } from "react-i18next";

export function CompilerSettings() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.compiler.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.compiler.subtitle")}
          </p>
        </div>
        <CompileSettingsFields />
      </div>
    </div>
  );
}
