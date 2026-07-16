import CommandsSettings from "./commands-settings";
import { useTranslation } from "react-i18next";

export function SlashCommandsSettings() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.commandsPage.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.commandsPage.subtitle")}
          </p>
        </div>

        <CommandsSettings />
      </div>
    </div>
  );
}
