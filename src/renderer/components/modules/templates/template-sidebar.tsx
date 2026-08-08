import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TemplateMeta } from "./types";
import { TemplateFull, TemplateCategory, CATEGORIES } from "./types";

function categoryCount(templates: TemplateMeta[] | null, categoryId: string): number {
  if (!templates) return 0;
  if (categoryId === "all") return templates.length;
  return templates.filter((t) => t.category === categoryId).length;
}

// ─── Sidebar ───

export function TemplateSidebar({
  category,
  setCategory,
  templates,
}: {
  category: TemplateCategory | "all";
  setCategory: (c: TemplateCategory | "all") => void;
  templates: TemplateMeta[] | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="lg:w-[200px] shrink-0 flex flex-col gap-1 px-2">
      <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider hidden lg:block">
        {t("templates.center.categories")}
      </p>

      <div className="flex flex-col gap-1">
        {CATEGORIES.map((cat) => {
          const count = categoryCount(templates, cat.id);
          const label = t(cat.labelKey);
          return (
            <button
              key={cat.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] transition-colors text-left",
                category === cat.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              onClick={() => setCategory(cat.id)}
            >
              {cat.icon}
              <span className="truncate flex-1">{label}</span>
              <span className="text-[length:var(--font-size-10)] tabular-nums text-muted-foreground shrink-0">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Detail Sidebar ───

export function DetailSidebar({
  template,
  isCurrent = false,
}: {
  template: TemplateFull;
  isCurrent?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="lg:w-[200px] shrink-0 flex flex-col gap-1 px-2 order-2 lg:order-none">
      <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground uppercase tracking-wider hidden lg:block">
        {t("templates.detail.info")}
      </p>

      <div className="flex flex-col gap-y-3 text-[length:var(--font-size-12)] text-muted-foreground px-2">
        {isCurrent ? (
          <div>
            <span className="text-muted-foreground">{t("templates.center.status")}</span>
            <p className="text-foreground font-medium">{t("templates.center.inUse")}</p>
          </div>
        ) : null}
        <div>
          <span className="text-muted-foreground">{t("templates.detail.documentClass")}</span>
          <p className="capitalize text-foreground">{template.documentClass}</p>
        </div>
        <div>
          <span className="text-muted-foreground">{t("templates.detail.fileCount")}</span>
          <p className="text-foreground">{template.files.length}</p>
        </div>
        <div>
          <span className="text-muted-foreground">{t("templates.detail.category")}</span>
          <p className="capitalize text-foreground">{template.category}</p>
        </div>
      </div>
    </div>
  );
}
