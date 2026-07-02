import { useMemo } from "react";
import { TagIcon } from "lucide-react";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuLabel,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { useLiteratureStore } from "@/stores/literature-store";
import { useDocumentStore } from "@/stores/document-store";
import { collectProjectTags } from "@/lib/literature/paper-tag-utils";
import { paperTagDotClass, paperTagToneClass } from "../../../shared/paper-tags";
import { cn } from "@/lib/utils";

const triggerClass = cn(
  "inline-flex items-center gap-1 h-6 shrink-0 border-0 bg-transparent px-0",
  "text-[length:var(--font-menu-item)] text-muted-foreground",
  "transition-colors hover:text-foreground data-[state=open]:text-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/35 rounded-sm",
);

const tagPillClass =
  "inline-flex shrink-0 rounded-full border px-1.5 py-0 text-[length:var(--font-size-11)] leading-5";

function tagFilterTitle(tag: string | null, count: number | undefined): string {
  if (!tag) return "Filter by tag";
  return count != null ? `Filter: ${tag} (${count})` : `Filter: ${tag}`;
}

/** Library toolbar — filter entries by user tag (shown when any tag exists). */
export function LiteratureTagFilterDropdown({ compact = false }: { compact?: boolean }) {
  const papers = useLiteratureStore((s) => s.papers);
  const libraryTagFilter = useLiteratureStore((s) => s.libraryTagFilter);
  const setLibraryTagFilter = useLiteratureStore((s) => s.setLibraryTagFilter);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const projectTags = useMemo(() => collectProjectTags(papers), [papers]);
  if (projectTags.length === 0) return null;

  const activeEntry = libraryTagFilter
    ? projectTags.find((e) => e.tag.toLowerCase() === libraryTagFilter.toLowerCase())
    : null;

  const handleSelect = (tag: string | null) => {
    if (!projectRoot) return;
    void setLibraryTagFilter(projectRoot, tag);
  };

  const title = tagFilterTitle(libraryTagFilter, activeEntry?.count);

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            triggerClass,
            compact && "relative size-6 shrink-0 justify-center",
            libraryTagFilter && "text-foreground",
          )}
          title={title}
        >
          {compact ? (
            <>
              <TagIcon className="size-3.5 shrink-0" />
              {libraryTagFilter ? (
                <span
                  className={cn(
                    "absolute top-0.5 right-0.5 size-1.5 rounded-full ring-1 ring-background",
                    paperTagDotClass(libraryTagFilter),
                  )}
                  aria-hidden
                />
              ) : null}
            </>
          ) : (
            <>
              <TagIcon className="size-3 shrink-0" />
              {libraryTagFilter ? (
                <span className={cn(tagPillClass, paperTagToneClass(libraryTagFilter))}>
                  {libraryTagFilter}
                </span>
              ) : (
                <span>Tags</span>
              )}
              {activeEntry ? (
                <span className="tabular-nums text-muted-foreground/70">{activeEntry.count}</span>
              ) : null}
            </>
          )}
        </button>
      </AppMenuTrigger>
      <AppMenuContent align="start" className="min-w-[10rem]">
        <AppMenuLabel>Filter by tag</AppMenuLabel>
        <AppMenuCheckItem selected={!libraryTagFilter} onClick={() => handleSelect(null)}>
          All entries
        </AppMenuCheckItem>
        <AppMenuSeparator />
        {projectTags.map(({ tag, count }) => (
          <AppMenuCheckItem
            key={tag}
            selected={libraryTagFilter?.toLowerCase() === tag.toLowerCase()}
            onClick={() => handleSelect(tag)}
            trailing={
              <span className="tabular-nums text-muted-foreground/60">{count}</span>
            }
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", paperTagDotClass(tag))}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{tag}</span>
          </AppMenuCheckItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
