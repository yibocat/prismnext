import { cn } from "@/lib/utils";
import { TemplateFull, TemplateCategory, CATEGORIES } from "./types";

// ─── Sidebar ───

export function TemplateSidebar({
  category,
  setCategory,
}: {
  category: TemplateCategory | "all";
  setCategory: (c: TemplateCategory | "all") => void;
}) {
  return (
    <div className="lg:w-[200px] shrink-0 flex flex-col gap-1 px-2 pt-8">
      {/* Header */}
      <div className="px-2 mb-6 hidden lg:block">
        <h2 className="text-[length:var(--font-session-item)] font-semibold">Template Center</h2>
      </div>

      {/* Category label */}
      <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground/60 uppercase tracking-wider hidden lg:block">
        Categories
      </p>

      {/* Category items */}
      <div className="flex flex-col gap-1">
        {CATEGORIES.map((cat) => (
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
            <span className="truncate">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Detail Sidebar ───

export function DetailSidebar({ template }: { template: TemplateFull }) {
  return (
    <div className="lg:w-[200px] shrink-0 flex flex-col gap-1 px-2 pt-8 order-2 @lg:order-none">
      <div className="px-2 mb-6 hidden lg:block">
        <h2 className="text-[length:var(--font-session-item)] font-semibold">
          Template / {template.name}
        </h2>
      </div>

      <p className="px-2 pb-1 text-[length:var(--font-hint)] text-muted-foreground/60 uppercase tracking-wider hidden lg:block">
        Info
      </p>

      {/* Info items */}
      <div className="flex flex-col gap-y-3 text-[length:var(--font-size-12)] text-muted-foreground px-2">
        <div>
          <span className="text-muted-foreground/60">Document class</span>
          <p className="capitalize">{template.documentClass}</p>
        </div>
        <div>
          <span className="text-muted-foreground/60">Files</span>
          <p>{template.files.length}</p>
        </div>
        <div>
          <span className="text-muted-foreground/60">Created</span>
          <p>Jun 2024</p>
        </div>
        <div>
          <span className="text-muted-foreground/60">Updated</span>
          <p>Jun 2024</p>
        </div>
      </div>
    </div>
  );
}
