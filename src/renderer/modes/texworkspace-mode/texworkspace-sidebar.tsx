import { useState, useMemo, useCallback } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR } from "@/types/workspace";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLayoutStore } from "@/stores/layout-store";
import {
  useLatexStructure,
  type TocEntry,
  type LabelEntry,
  type CitationEntry,
  type FigureTableEntry,
  type TodoEntry,
} from "@/hooks/use-latex-structure";
import { useProjectSearch, type SearchResult } from "@/hooks/use-project-search";
import { buildFileTree } from "@/lib/files/file-tree";
import { filterFilesByMode, filterFoldersByMode } from "@/modes/files-mode/file-filter";
import {
  ChevronRightIcon,
  FileTextIcon,
  HeadingIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
  ImageIcon,
  Table2Icon,
  SigmaIcon,
  TagIcon,
  QuoteIcon,
  HashIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
  ListTreeIcon,
  Link2Icon,
  CheckCheckIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import {
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getFileIconName } from "@/lib/files/file-icon-class";
import { Icon } from "@iconify/react/offline";

// ─── Constants ───

type SidebarTab = "outline" | "refs" | "files";

const TABS: { key: SidebarTab; icon: React.ReactNode; label: string }[] = [
  { key: "outline", icon: <ListTreeIcon className="size-3.5" />, label: "Outline" },
  { key: "refs", icon: <Link2Icon className="size-3.5" />, label: "References" },
  { key: "files", icon: <FileTextIcon className="size-3.5" />, label: "Files" },
];

const LABEL_ICON: Record<LabelEntry["kind"], React.ReactNode> = {
  section: <HashIcon className="size-3 shrink-0" />,
  figure: <ImageIcon className="size-3 shrink-0" />,
  table: <Table2Icon className="size-3 shrink-0" />,
  equation: <SigmaIcon className="size-3 shrink-0" />,
  other: <TagIcon className="size-3 shrink-0" />,
};

const TODO_COLORS: Record<TodoEntry["kind"], string> = {
  TODO: "text-amber-500",
  FIXME: "text-red-500",
  HACK: "text-violet-500",
};

// ─── TOC Tree ───

const HEADING_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  1: Heading1Icon, 2: Heading2Icon, 3: Heading3Icon,
  4: Heading4Icon, 5: Heading5Icon, 6: Heading6Icon,
};

function SectionIcon({ level, dimmed }: { level: number; dimmed?: boolean }) {
  const IconComp = HEADING_ICONS[level];
  if (!IconComp) return <span className="size-3 shrink-0" />;
  return <IconComp className={cn("size-3 shrink-0", dimmed ? "text-muted-foreground/60" : "text-muted-foreground")} />;
}

function TocNode({ entry, depth, onSelect }: { entry: TocEntry; depth: number; onSelect: (e: TocEntry) => void }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = entry.children.length > 0;
  return (
    <div>
      <SidebarMenuButton
        size="sm" onClick={() => onSelect(entry)} title={entry.title}
        className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} />
        ) : <span className="size-3 shrink-0" />}
        <SectionIcon level={entry.level} dimmed={!hasChildren} />
        <span className="truncate">{entry.title}</span>
      </SidebarMenuButton>
      {hasChildren && expanded && <TocTree entries={entry.children} depth={depth + 1} onSelect={onSelect} />}
    </div>
  );
}

function TocTree({ entries, depth, onSelect }: { entries: TocEntry[]; depth: number; onSelect: (e: TocEntry) => void }) {
  return <>{entries.map((e, i) => <TocNode key={`${e.fileId}:${e.line}:${i}`} entry={e} depth={depth} onSelect={onSelect} />)}</>;
}

// ─── TeX File Tree ───

function TexFileTree({ tree, depth, onSelect }: { tree: ReturnType<typeof buildFileTree>; depth: number; onSelect: (fileId: string) => void }) {
  return <>{tree.map((node) => (
    <div key={node.relativePath}>
      {node.type === "folder" ? (
        <FolderNode node={node} depth={depth} onSelect={onSelect} />
      ) : (
        <SidebarMenuButton size="sm" onClick={() => onSelect(node.file?.id ?? "")}
          disabled={!node.file?.id}
          className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
          style={{ paddingLeft: `${8 + depth * 16}px` }}>
          <Icon icon={getFileIconName(node.name)} className="size-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </SidebarMenuButton>
      )}
    </div>
  ))}</>;
}

function FolderNode({ node, depth, onSelect }: { node: ReturnType<typeof buildFileTree>[number]; depth: number; onSelect: (fileId: string) => void }) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <div>
      <SidebarMenuButton size="sm" onClick={() => setOpen(!open)}
        className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
        style={{ paddingLeft: `${8 + depth * 16}px` }}>
        <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="truncate">{node.name}</span>
      </SidebarMenuButton>
      {open && node.children.length > 0 && <TexFileTree tree={node.children} depth={depth + 1} onSelect={onSelect} />}
    </div>
  );
}

// ─── Accordion Trigger (SidebarMenuButton styled) ───

function SidebarAccordionTrigger({ icon, label, badge }: { icon: React.ReactNode; label: string; badge?: string }) {
  return (
    <AccordionTrigger className="[&>svg]:hidden h-7 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground hover:no-underline py-0 px-0 group">
      <SidebarMenuButton size="sm" className="[&>svg]:!size-3 h-7 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground w-full">
        <ChevronRightIcon className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        {icon}
        <span className="flex-1 text-left">{label}</span>
        {badge && <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums">{badge}</span>}
      </SidebarMenuButton>
    </AccordionTrigger>
  );
}

// ─── Main Component ───

export function TexworkspaceSidebar() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("outline");
  const [accordionValue, setAccordionValue] = useState<string[]>([]);

  const files = useDocumentStore((s) => s.files);
  const allFolders = useDocumentStore((s) => s.folders);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const manuscriptDir = manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR;
  const openedContents = useDocumentStore((s) => s.openedContents);
  const setTexworkspaceActiveFile = useRightPanelStore((s) => s.setTexworkspaceActiveFile);
  const requestJumpToLine = useDocumentStore((s) => s.requestJumpToLine);
  const searchQuery = useLayoutStore((s) => s.texworkspaceSearchQuery);
  const setSearchQuery = useLayoutStore((s) => s.setTexworkspaceSearchQuery);

  const searchResults = useProjectSearch(searchQuery);
  const isSearching = searchQuery !== "";

  // Auto-open is handled centrally by use-texworkspace.ts — the canonical
  // hook that scopes to the configured manuscript directory and triggers
  // auto-compile when enabled. No duplicate logic here.

  const getContent = useCallback((id: string) => openedContents.get(id)?.content ?? "", [openedContents]);
  const { toc, labels, citations, figureTables, todos, texFiles } = useLatexStructure(files, getContent);

  const manuscriptTree = useMemo(() => {
    const scopedFiles = filterFilesByMode(files, "manuscript", manuscriptDir);
    const scopedFolders = filterFoldersByMode(allFolders, "manuscript", manuscriptDir);
    return buildFileTree(scopedFiles, scopedFolders);
  }, [files, allFolders, manuscriptDir]);

  // ─── Navigation ───

  const navigateTo = useCallback((fileId: string, line?: number) => {
    setTexworkspaceActiveFile(fileId);
    if (line) setTimeout(() => requestJumpToLine(fileId, line), 80);
  }, [setTexworkspaceActiveFile, requestJumpToLine]);

  const handleTocSelect = useCallback((e: TocEntry) => navigateTo(e.fileId, e.line), [navigateTo]);
  const handleLabelSelect = useCallback((e: LabelEntry) => navigateTo(e.fileId, e.line), [navigateTo]);
  const handleCiteSelect = useCallback((e: CitationEntry) => navigateTo(e.fileId, e.line), [navigateTo]);
  const handleFigureTableSelect = useCallback((e: FigureTableEntry) => navigateTo(e.fileId, e.line), [navigateTo]);
  const handleTodoSelect = useCallback((e: TodoEntry) => navigateTo(e.fileId, e.line), [navigateTo]);
  const handleFileSelect = useCallback((id: string) => setTexworkspaceActiveFile(id), [setTexworkspaceActiveFile]);
  const handleSearchResultSelect = useCallback((r: SearchResult) => navigateTo(r.fileId, r.line), [navigateTo]);

  // ─── Word count ───

  const wordCount = useMemo(() => {
    let total = 0;
    for (const f of texFiles) {
      const content = getContent(f.id);
      if (!content) continue;
      const stripped = content.replace(/%.*/g, " ").replace(/\\(?:[a-zA-Z@]+|.)/g, " ")
        .replace(/[\[\{][^}\]\[]*[\]\}]/g, " ").replace(/[{}[\]]/g, " ");
      total += stripped.split(/\s+/).filter((w) => w.length > 0).length;
    }
    return total;
  }, [texFiles, getContent]);

  const tocCount = toc.reduce((sum, e) => sum + 1 + countChildren(e), 0);
  const allExpanded = accordionValue.length > 0;

  const handleToggleAll = () => {
    if (allExpanded) setAccordionValue([]);
    else setAccordionValue(getAccordionItemsForTab(activeTab));
  };

  // ─── Render ───

  return (
    <>
      {/* Header: tabs + expand/collapse */}
      <SidebarHeader className="flex h-[var(--height-mode-selector)] shrink-0 flex-row items-center justify-end px-3 py-0 gap-1">
        <div className="flex items-center gap-0.5">
          {TABS.map((tab) => (
            <button key={tab.key} type="button"
              className={cn("flex size-5 items-center justify-center rounded transition-colors shrink-0",
                activeTab === tab.key ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}
              title={tab.label}
              onClick={() => { setActiveTab(tab.key); setAccordionValue([]); }}>
              {tab.icon}
            </button>
          ))}
        </div>
        <span className="h-3 w-px bg-border/40 shrink-0" />
        <button type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title={allExpanded ? "Collapse All" : "Expand All"} onClick={handleToggleAll}>
          {allExpanded ? <FoldVerticalIcon className="size-3.5" /> : <UnfoldVerticalIcon className="size-3.5" />}
        </button>
      </SidebarHeader>

      {!manuscriptConfig ? (
        <SidebarContent className="overflow-auto px-1.5 py-1">
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <FileTextIcon className="size-8 text-muted-foreground/30" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                No manuscript folder configured
              </p>
              <p className="text-xs text-muted-foreground/60 max-w-[220px]">
                Configure a manuscript folder in Settings → TeX Workspace to
                enable TeX editing, outline navigation, and compilation.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                useLayoutStore.getState().setLeftSidebarView("settings");
                useLayoutStore.getState().setSettingsCategory("texworkspace");
              }}
            >
              Open Workspace Settings
            </Button>
          </div>
        </SidebarContent>
      ) : (
        <SidebarContent className="overflow-auto px-1.5 py-1">
        {/* ── Search Results (when searching) ── */}
        {isSearching && (
          <div>
            <div className="flex items-center gap-1 px-0.5 pb-1">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/50" />
                <Input value={searchQuery === " " ? "" : searchQuery} placeholder="Search in project..."
                  onChange={(e) => setSearchQuery(e.target.value || " ")}
                  className="h-6 pl-6 pr-5 text-[length:var(--font-size-12)] rounded-sm" autoFocus />
                {searchQuery && searchQuery !== " " && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-1 top-1/2 -translate-y-1/2">
                    <XIcon className="size-3 text-muted-foreground/50 hover:text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            {searchResults.length === 0 && searchQuery !== " " && searchQuery.trim() !== "" ? (
              <p className="px-3 py-4 text-[length:var(--font-hint)] text-muted-foreground/60 text-center">No results</p>
            ) : (
              <div>
                {searchResults.map((r, i) => (
                  <SidebarMenuButton key={`${r.fileId}:${r.line}:${i}`} size="sm" onClick={() => handleSearchResultSelect(r)}
                    className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground">
                    <FileTextIcon className="size-3 shrink-0" />
                    <span className="truncate">{r.preview}</span>
                    <span className="text-[length:var(--font-hint)] text-muted-foreground/40 shrink-0">{r.fileName}:{r.line}</span>
                  </SidebarMenuButton>
                ))}
                {searchResults.length >= 100 && (
                  <p className="px-3 py-1 text-[length:var(--font-hint)] text-muted-foreground/40">Showing first 100 results</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Outline Tab ── */}
        {!isSearching && activeTab === "outline" && (
          <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue}>
            <AccordionItem value="toc" className="border-none">
              <SidebarAccordionTrigger icon={<HeadingIcon className="size-3" />} label="Table of Contents" badge={tocCount > 0 ? String(tocCount) : undefined} />
              <AccordionContent className="pb-0.5">
                {toc.length === 0 ? <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">No sections found</p>
                  : <TocTree entries={toc} depth={0} onSelect={handleTocSelect} />}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="figtables" className="border-none">
              <SidebarAccordionTrigger icon={<ImageIcon className="size-3" />} label="Figures & Tables" badge={figureTables.length > 0 ? String(figureTables.length) : undefined} />
              <AccordionContent className="pb-0.5">
                {figureTables.length === 0 ? <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">No figures or tables found</p>
                  : <div>{figureTables.map((ft, i) => (
                    <SidebarMenuButton key={`${ft.fileId}:${ft.label || ft.line}:${i}`} size="sm" onClick={() => handleFigureTableSelect(ft)} title={ft.caption}
                      className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground">
                      {ft.type === "figure" ? <ImageIcon className="size-3 shrink-0" /> : <Table2Icon className="size-3 shrink-0" />}
                      <span className="truncate">{ft.caption}</span>
                      {ft.label && <span className="text-[length:var(--font-hint)] text-muted-foreground/40 shrink-0">{ft.label}</span>}
                    </SidebarMenuButton>
                  ))}</div>}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="todos" className="border-none">
              <SidebarAccordionTrigger icon={<CheckCheckIcon className="size-3" />} label="TODO Markers" badge={todos.length > 0 ? String(todos.length) : undefined} />
              <AccordionContent className="pb-0.5">
                {todos.length === 0 ? <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">No TODO markers found</p>
                  : <div>{todos.map((t, i) => (
                    <SidebarMenuButton key={`${t.fileId}:${t.line}:${i}`} size="sm" onClick={() => handleTodoSelect(t)} title={t.text}
                      className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground">
                      <span className={cn("size-3 shrink-0 flex items-center justify-center text-[length:var(--font-hint)] font-bold", TODO_COLORS[t.kind])}>
                        {t.kind === "TODO" ? "T" : t.kind === "FIXME" ? "F" : "H"}
                      </span>
                      <span className="truncate">{t.text}</span>
                    </SidebarMenuButton>
                  ))}</div>}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* ── References Tab ── */}
        {!isSearching && activeTab === "refs" && (
          <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue}>
            <AccordionItem value="labels" className="border-none">
              <SidebarAccordionTrigger icon={<TagIcon className="size-3" />} label="Labels" badge={labels.length > 0 ? String(labels.length) : undefined} />
              <AccordionContent className="pb-0.5">
                {labels.length === 0 ? <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">No labels found</p>
                  : <div>{labels.map((l, i) => (
                    <SidebarMenuButton key={`${l.fileId}:${l.name}:${i}`} size="sm" onClick={() => handleLabelSelect(l)}
                      className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground">
                      {LABEL_ICON[l.kind]}<span className="truncate">{l.name}</span>
                    </SidebarMenuButton>
                  ))}</div>}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="citations" className="border-none">
              <SidebarAccordionTrigger icon={<QuoteIcon className="size-3" />} label="Cited References" badge={citations.length > 0 ? String(citations.length) : undefined} />
              <AccordionContent className="pb-0.5">
                {citations.length === 0 ? <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">No citations found</p>
                  : <div>{citations.map((c, i) => (
                    <SidebarMenuButton key={`${c.fileId}:${c.key}:${i}`} size="sm" onClick={() => handleCiteSelect(c)}
                      title={c.author ? `${c.author}, ${c.title ?? c.key}${c.year ? ` (${c.year})` : ""}` : c.key}
                      className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground">
                      <QuoteIcon className="size-3 shrink-0" />
                      <span className="truncate">{c.author ? <>{c.author}, <span className="text-muted-foreground/70">{c.title ?? c.key}</span>{c.year ? <span className="text-muted-foreground/50"> ({c.year})</span> : null}</> : c.key}</span>
                    </SidebarMenuButton>
                  ))}</div>}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* ── Files Tab ── */}
        {!isSearching && activeTab === "files" && (
          <div>
            {manuscriptTree.length === 0 ? (
              <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                No files in manuscript folder
              </p>
            ) : (
              <TexFileTree tree={manuscriptTree} depth={0} onSelect={handleFileSelect} />
            )}
          </div>
        )}

      </SidebarContent>
      )}

      {/* Footer: word count (Outline tab, not searching) — only when manuscript is configured */}
      {manuscriptConfig && !isSearching && activeTab === "outline" && (
        <SidebarFooter className="flex-row h-6 shrink-0 items-center justify-end px-3 py-0 gap-0 pb-1">
          <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums">{wordCount.toLocaleString()} words</span>
        </SidebarFooter>
      )}
    </>
  );
}

// ─── Helpers ───

function countChildren(e: TocEntry): number { return e.children.reduce((sum, c) => sum + 1 + countChildren(c), 0); }
function getAccordionItemsForTab(tab: SidebarTab): string[] {
  switch (tab) { case "outline": return ["toc", "figtables", "todos"]; case "refs": return ["labels", "citations"]; default: return []; }
}
