import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SearchIcon, XIcon, FileTextIcon } from "lucide-react";
import { TemplateMeta, TemplateCategory, TEMPLATE_ICONS } from "./types";


// ─── Gallery ───

export function GalleryView({
  templates,
  category,
  search,
  setSearch,
  onSelect,
  onUse,
}: {
  templates: TemplateMeta[] | null;
  category: TemplateCategory | "all";
  search: string;
  setSearch: (s: string) => void;
  onSelect: (t: TemplateMeta) => void;
  onUse: (t: TemplateMeta) => void;
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
  }, [category, search]);

  return (
    <div className="flex-1 overflow-y-auto pt-8 pb-8">
      {/* Search bar */}
      <div className="relative mb-6">
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
          <SearchIcon className="size-8 opacity-20" />
          <p className="text-[length:var(--font-size-13)]">No templates found</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
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
