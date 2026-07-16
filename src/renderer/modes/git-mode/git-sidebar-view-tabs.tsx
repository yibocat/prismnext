import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGitStore } from "@/stores/git-store";
import { cn } from "@/lib/utils";

const tabTriggerClass = cn(
  "h-6 px-0 text-[length:var(--font-size-11)] font-medium",
  "bg-transparent shadow-none rounded-none",
  "text-muted-foreground/60",
  "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
  "hover:text-foreground transition-colors",
);

/** Changes / History — text-only toggle in sidebar header. */
export function GitSidebarViewTabs() {
  const { t } = useTranslation();
  const sidebarView = useGitStore((s) => s.sidebarView);
  const setSidebarView = useGitStore((s) => s.setSidebarView);

  return (
    <Tabs
      value={sidebarView}
      onValueChange={(value) => setSidebarView(value as "changes" | "history")}
      className="gap-0 shrink-0"
    >
      <TabsList className="h-7 gap-3 p-0 bg-transparent border-0 shadow-none">
        <TabsTrigger value="changes" className={tabTriggerClass}>
          {t("modes.git.changes")}
        </TabsTrigger>
        <TabsTrigger value="history" className={tabTriggerClass}>
          {t("modes.git.history")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
