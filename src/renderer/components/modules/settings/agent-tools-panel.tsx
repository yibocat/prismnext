import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";
import { PromptInternalsNotice } from "./prompt-internals-notice";
import { SettingsModulePromptPreview } from "./settings-module-prompt-preview";

const CATEGORY_ORDER = ["reference", "compile", "project", "utility"] as const;

type BuiltinToolInfo = Awaited<ReturnType<typeof window.electronAPI.settingsGetBuiltinTools>>[number];

export function AgentToolsPanel() {
  const { t } = useTranslation();
  const [tools, setTools] = useState<BuiltinToolInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI.settingsGetBuiltinTools()
      .then((list) => {
        if (!cancelled) setTools(list);
      })
      .catch(() => {
        if (!cancelled) setTools([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, BuiltinToolInfo[]>();
    for (const tool of tools) {
      const list = map.get(tool.category) ?? [];
      list.push(tool);
      map.set(tool.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
      category,
      tools: map.get(category) ?? [],
    }));
  }, [tools]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className={SETTINGS_DETAIL_SHELL}>
      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-[length:var(--font-size-15)] font-semibold">
            {t("settings.editor.agentTools.title")}
          </h2>
          <p className={SETTINGS_ROW_DESC}>{t("settings.editor.agentTools.intro")}</p>
        </div>
        <PromptInternalsNotice />
      </div>

      {grouped.map(({ category, tools: categoryTools }) => (
        <section key={category} className="min-w-0 space-y-3">
          <h3 className={SETTINGS_CATEGORY_HEADER}>
            {t(`settings.editor.agentTools.category.${category}`)}
          </h3>
          <div className="min-w-0 space-y-8">
            {categoryTools.map((tool) => (
              <article key={tool.name} className="min-w-0 space-y-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-[length:var(--font-size-13)] font-medium">{tool.label}</p>
                  <code className="text-[length:var(--font-size-11)] text-muted-foreground">
                    {tool.name}
                  </code>
                </div>
                {tool.schemaDescription.trim() ? (
                  <SettingsModulePromptPreview content={tool.schemaDescription} />
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
