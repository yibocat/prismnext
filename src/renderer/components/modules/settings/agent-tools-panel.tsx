import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_DETAIL_SHELL,
  SETTINGS_ROW_DESC,
} from "./settings-tokens";

const BADGE =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[length:var(--font-size-10)] font-medium uppercase tracking-wide shrink-0";

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
      <div className="space-y-1">
        <h2 className="text-[length:var(--font-size-15)] font-semibold">{t("settings.editor.agentTools.title")}</h2>
        <p className={SETTINGS_ROW_DESC}>{t("settings.editor.agentTools.intro")}</p>
      </div>

      {grouped.map(({ category, tools: categoryTools }) => (
        <section key={category} className="space-y-3">
          <h3 className={SETTINGS_CATEGORY_HEADER}>
            {t(`settings.editor.agentTools.category.${category}`)}
          </h3>
          <div className="space-y-3">
            {categoryTools.map((tool) => (
              <article
                key={tool.name}
                className="rounded-lg border border-border px-4 py-3 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[length:var(--font-size-13)] font-medium">{tool.label}</p>
                  <code className="text-[length:var(--font-size-11)] text-muted-foreground">
                    {tool.name}
                  </code>
                  <span className={cn(BADGE, "bg-muted text-muted-foreground")}>{t("common.readOnly")}</span>
                </div>
                <pre className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-[length:var(--font-size-12)] leading-relaxed text-foreground/90 font-mono">
                  {tool.schemaDescription}
                </pre>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
