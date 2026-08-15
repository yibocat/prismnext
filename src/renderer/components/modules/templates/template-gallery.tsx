import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SearchIcon, XIcon, FileTextIcon } from "lucide-react";
import { TemplateMeta, TemplateCategory, TEMPLATE_ICONS, CATEGORIES } from "./types";
import { cn } from "@/lib/utils";

export function GalleryView({
  templates,
  category,
  setCategory,
  search,
  setSearch,
  onSelect,
  onUse,
  canApply = true,
  currentTemplateId = null,
}: {
  templates: TemplateMeta[] | null;
  category: TemplateCategory | "all";
  setCategory: (c: TemplateCategory | "all") => void;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (t: TemplateMeta) => void;
  onUse: (t: TemplateMeta) => void;
  canApply?: boolean;
  currentTemplateId?: string | null;
}) {
  const { t } = useTranslation();

  const filtered = useMemo(() => {
    if (!templates) return [];
    let list = category === "all" ? templates : templates.filter((tmpl) => tmpl.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tmpl) =>
          tmpl.name.toLowerCase().includes(q) ||
          tmpl.description.toLowerCase().includes(q) ||
          tmpl.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [templates, category, search]);

  if (!templates) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  const activeCategoryLabel =
    category === "all" ? null : t(CATEGORIES.find((c) => c.id === category)?.labelKey ?? category);
  const totalCount = templates.length;

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      <div className="relative mb-4">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("templates.center.search")}
          className="h-8 pl-8 pr-7 text-[length:var(--font-size-12)] rounded-md border border-border bg-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-ring transition-all shadow-none"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
            <XIcon className="size-3 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-[length:var(--font-size-11)] text-muted-foreground">
          <span>
            {filtered.length === totalCount
              ? t("templates.center.countAll", { count: totalCount })
              : t("templates.center.countFiltered", {
                  shown: filtered.length,
                  total: totalCount,
                })}
          </span>
          {activeCategoryLabel ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span>{t("templates.center.categoryLabel", { name: activeCategoryLabel })}</span>
              <button
                type="button"
                className="text-primary hover:underline underline-offset-2"
                onClick={() => setCategory("all")}
              >
                {t("templates.center.all")}
              </button>
            </>
          ) : null}
          {search.trim() ? (
            <>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                className="text-primary hover:underline underline-offset-2"
                onClick={() => setSearch("")}
              >
                {t("templates.center.clearSearch")}
              </button>
            </>
          ) : null}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <SearchIcon className="size-8 opacity-20" />
          <p className="text-[length:var(--font-size-13)]">{t("templates.center.noFound")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-4 gap-3">
          {filtered.map((tmpl) => {
            const inUse = currentTemplateId === tmpl.id;
            const IconComp = TEMPLATE_ICONS[tmpl.id] ?? FileTextIcon;
            return (
              <Card
                key={tmpl.id}
                className={cn(
                  "cursor-pointer transition-colors overflow-hidden",
                  inUse ? "border-primary" : "hover:border-border",
                )}
                onClick={() => onSelect(tmpl)}
              >
                <div className="relative h-14 flex items-center justify-center bg-muted">
                  <IconComp className="size-5 text-muted-foreground" />
                  {inUse ? (
                    <Badge className="absolute top-1.5 right-1.5 h-5 px-1.5 text-[length:var(--font-size-10)]">
                      {t("templates.center.inUse")}
                    </Badge>
                  ) : null}
                </div>
                <CardHeader className="p-2.5 gap-0">
                  <CardTitle className="text-[length:var(--font-size-12)]">{tmpl.name}</CardTitle>
                  <CardDescription className="text-[length:var(--font-badge)] line-clamp-2 leading-relaxed mt-0.5">
                    {tmpl.description}
                  </CardDescription>
                  <p className="mt-1.5 text-[length:var(--font-size-10)] uppercase tracking-wide text-muted-foreground">
                    {tmpl.category} · {tmpl.documentClass}
                  </p>
                </CardHeader>
                <div className="px-2.5 pb-2.5">
                  <Button
                    size="sm"
                    className="h-7 w-full text-[length:var(--font-size-12)] shadow-none"
                    disabled={!canApply}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUse(tmpl);
                    }}
                  >
                    {inUse ? t("templates.detail.reapply") : t("templates.detail.use")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
