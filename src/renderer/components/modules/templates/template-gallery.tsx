import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SearchIcon, XIcon, FileTextIcon } from "lucide-react";
import { TemplateMeta, TemplateCategory, TEMPLATE_ICONS, CATEGORIES } from "./types";


// ─── Gallery ───

export function GalleryView({
  templates,
  category,
  setCategory,
  search,
  setSearch,
  onSelect,
  onUse,
  canApply = true,
}: {
  templates: TemplateMeta[] | null;
  category: TemplateCategory | "all";
  setCategory: (c: TemplateCategory | "all") => void;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (t: TemplateMeta) => void;
  onUse: (t: TemplateMeta) => void;
  canApply?: boolean;
}) {
  if (!templates) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[length:var(--font-size-12)] text-muted-foreground/50">Loading templates...</p>
      </div>
    );
  }

  const filtered = useMemo(() => {
    let list = category === "all" ? templates : templates.filter((t) => t.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [templates, category, search]);

  const activeCategoryLabel =
    category === "all" ? null : CATEGORIES.find((c) => c.id === category)?.label ?? category;
  const totalCount = templates?.length ?? 0;

  return (
    <div className="flex-1 overflow-y-auto pb-8">
      {/* Search bar */}
      <div className="relative mb-4">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="h-8 pl-8 pr-7 text-[length:var(--font-size-12)] rounded-md border border-border/40 bg-transparent hover:border-border/60 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all shadow-none"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            <XIcon className="size-3 text-muted-foreground/40 hover:text-muted-foreground" />
          </button>
        )}
      </div>

      {templates && totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-4 text-[length:var(--font-size-11)] text-muted-foreground">
          <span>
            {filtered.length === totalCount
              ? `${totalCount} templates`
              : `Showing ${filtered.length} of ${totalCount}`}
          </span>
          {activeCategoryLabel ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>Category: {activeCategoryLabel}</span>
              <button
                type="button"
                className="text-primary hover:underline underline-offset-2"
                onClick={() => setCategory("all")}
              >
                Show all
              </button>
            </>
          ) : null}
          {search.trim() ? (
            <>
              <span className="text-muted-foreground/40">·</span>
              <button
                type="button"
                className="text-primary hover:underline underline-offset-2"
                onClick={() => setSearch("")}
              >
                Clear search
              </button>
            </>
          ) : null}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <SearchIcon className="size-8 opacity-20" />
          <p className="text-[length:var(--font-size-13)]">No templates found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 @sm:grid-cols-2 @md:grid-cols-3 @2xl:grid-cols-4 gap-3">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer hover:border-primary/30 transition-colors overflow-hidden"
              onClick={() => onSelect(t)}
            >
              <div className="h-14 flex items-center justify-center bg-muted/30">
                {(() => { const IconComp = TEMPLATE_ICONS[t.id] ?? FileTextIcon; return <IconComp className="size-5 text-muted-foreground/50" />; })()}
              </div>
              <CardHeader className="p-2.5 gap-0">
                <CardTitle className="text-[length:var(--font-size-12)]">{t.name}</CardTitle>
                <CardDescription className="text-[length:var(--font-badge)] line-clamp-2 leading-relaxed mt-0.5">
                  {t.description}
                </CardDescription>
              </CardHeader>
              <div className="px-2.5 pb-2.5">
                <Button
                  size="sm"
                  className="h-7 w-full text-[length:var(--font-size-12)] shadow-none"
                  disabled={!canApply}
                  onClick={(e) => { e.stopPropagation(); onUse(t); }}
                >
                  Use
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
