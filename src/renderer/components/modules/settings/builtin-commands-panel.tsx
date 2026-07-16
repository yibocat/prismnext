import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useCommandStore } from "@/stores/command-store";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";

export function BuiltinCommandsPanel() {
  const { t } = useTranslation();
  const commands = useCommandStore((s) => s.commands);
  const loaded = useCommandStore((s) => s.loaded);
  const loadCommands = useCommandStore((s) => s.loadCommands);
  const toggleCommand = useCommandStore((s) => s.toggleCommand);

  useEffect(() => {
    void loadCommands();
  }, [loadCommands]);

  const builtInCommands = commands
    .filter((c) => c.source === "builtin")
    .sort((a, b) => a.order - b.order);

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className={SETTINGS_DETAIL_SHELL}>
      <div className="space-y-1">
        <h2 className="text-[length:var(--font-size-15)] font-semibold">
          {t("settings.editor.builtinCommands.title")}
        </h2>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.builtinCommands.intro")}</p>
      </div>

      <section className="space-y-3">
        <h3 className={SETTINGS_CATEGORY_HEADER}>
          {t("settings.editor.builtinCommands.section")}
        </h3>
        {builtInCommands.length === 0 ? (
          <p className={SETTINGS_ROW_DESC}>{t("settings.editor.builtinCommands.empty")}</p>
        ) : (
          <div className="space-y-3">
            {builtInCommands.map((cmd) => (
              <article
                key={cmd.id}
                className="rounded-lg border border-border px-4 py-3 space-y-2"
              >
                <div className={cn(SETTINGS_ROW, "!py-0")}>
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-primary text-[length:var(--font-size-13)] font-medium">
                        /{cmd.name}
                      </span>
                      {cmd.action ? (
                        <span className={cn(BADGE, "bg-primary/10 text-primary")}>
                          {t("settings.editor.builtinCommands.badgeShortcut")}
                        </span>
                      ) : null}
                      <span className={cn(BADGE, "bg-muted text-muted-foreground")}>
                        {t("settings.editor.builtinCommands.badgeBuiltin")}
                      </span>
                    </div>
                    <p className={SETTINGS_ROW_DESC}>{cmd.description}</p>
                    {cmd.template.trim() ? (
                      <p className="text-[length:var(--font-size-11)] text-muted-foreground/80 mt-1 font-mono truncate">
                        {t("settings.editor.builtinCommands.template", {
                          template: cmd.template.trim(),
                        })}
                      </p>
                    ) : null}
                    {cmd.action ? (
                      <p className="text-[length:var(--font-size-11)] text-muted-foreground/80 mt-0.5">
                        {t("settings.editor.builtinCommands.action", { action: cmd.action })}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={cmd.enabled}
                    onCheckedChange={(v) => void toggleCommand(cmd.id, v)}
                    aria-label={t("settings.editor.builtinCommands.enableAria", {
                      name: cmd.name,
                    })}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
