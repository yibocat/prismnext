import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useLatexStructure, type TocEntry, type LabelEntry, type CitationEntry } from "@/hooks/use-latex-structure";
import { resolveCompileTarget } from "@/lib/resolve-tex-root";
import { buildFileTree } from "@/lib/file-tree";
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
  ScrollTextIcon,
  HashIcon,
  FoldVerticalIcon,
  UnfoldVerticalIcon,
} from "lucide-react";
import { useCompileStore } from "@/stores/compile-store";
import {
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { getFileIconName } from "@/lib/file-icon-class";
import { Icon } from "@iconify/react";

// ─── Label kind icon ───

const LABEL_ICON: Record<LabelEntry["kind"], React.ReactNode> = {
  section: <HashIcon className="size-3 shrink-0" />,
  figure: <ImageIcon className="size-3 shrink-0" />,
  table: <Table2Icon className="size-3 shrink-0" />,
  equation: <SigmaIcon className="size-3 shrink-0" />,
  other: <TagIcon className="size-3 shrink-0" />,
};

// ─── Accordion Section ───

function AccordionSection({
  title,
  icon,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SidebarMenuButton
        size="sm"
        onClick={onToggle}
        className="[&>svg]:!size-3 h-7 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
      >
        <ChevronRightIcon
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {badge && (
          <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums">
            {badge}
          </span>
        )}
      </SidebarMenuButton>
      {open && <SidebarMenu className="gap-0.5 pb-0.5">{children}</SidebarMenu>}
    </div>
  );
}

// ─── TOC Tree ───

const HEADING_ICONS: Record<number, React.ComponentType<{ className?: string }>> = {
  1: Heading1Icon,
  2: Heading2Icon,
  3: Heading3Icon,
  4: Heading4Icon,
  5: Heading5Icon,
  6: Heading6Icon,
};

function SectionIcon({ level, dimmed }: { level: number; dimmed?: boolean }) {
  const Icon = HEADING_ICONS[level];
  if (!Icon) return <span className="size-3 shrink-0" />;
  return <Icon className={cn("size-3 shrink-0", dimmed ? "text-muted-foreground/60" : "text-muted-foreground")} />;
}

function TocNode({ entry, depth, onSelect }: { entry: TocEntry; depth: number; onSelect: (e: TocEntry) => void }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = entry.children.length > 0;

  return (
    <div>
      <SidebarMenuButton
        size="sm"
        onClick={() => onSelect(entry)}
        title={entry.title}
        className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <ChevronRightIcon
            className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <SectionIcon level={entry.level} dimmed={!hasChildren} />
        <span className="truncate">{entry.title}</span>
      </SidebarMenuButton>
      {hasChildren && expanded && (
        <TocTree entries={entry.children} depth={depth + 1} onSelect={onSelect} />
      )}
    </div>
  );
}

function TocTree({ entries, depth, onSelect }: { entries: TocEntry[]; depth: number; onSelect: (e: TocEntry) => void }) {
  return (
    <>
      {entries.map((e, i) => (
        <TocNode key={`${e.fileId}:${e.line}:${i}`} entry={e} depth={depth} onSelect={onSelect} />
      ))}
    </>
  );
}

// ─── Main Component ───

export function TexworkspaceSidebar() {
  const [sidebarTab, setSidebarTab] = useState<"structure" | "log">("structure");
  const [sections, setSections] = useState({ toc: true, labels: false, cites: false, texfiles: false });

  const toggleSection = (key: keyof typeof sections) =>
    setSections((s) => ({ ...s, [key]: !s[key] }));
  const expandAll = () => setSections({ toc: true, labels: true, cites: true, texfiles: true });
  const collapseAll = () => setSections({ toc: false, labels: false, cites: false, texfiles: false });
  const anyExpanded = Object.values(sections).some(Boolean);
  const allExpanded = Object.values(sections).every(Boolean);

  const files = useDocumentStore((s) => s.files);
  const fileContents = useDocumentStore((s) => s.fileContents);
  const setTexworkspaceActiveFile = useRightPanelStore((s) => s.setTexworkspaceActiveFile);
  const requestJumpToLine = useDocumentStore((s) => s.requestJumpToLine);
  const compileError = useCompileStore((s) => s.compileError);
  const compileLog = useCompileStore((s) => s.compileLog);
  const isCompiling = useCompileStore((s) => s.isCompiling);
  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);

  // Auto-open main .tex file when entering texworkspace in initial state
  const autoOpened = useRef(false);
  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || activeTab.kind !== "texworkspace" || !activeTab.isInitial) return;
    if (autoOpened.current) return;
    autoOpened.current = true;

    const firstTex = files.find((f) => f.name.endsWith(".tex"));
    const resolved = resolveCompileTarget(
      firstTex?.id ?? "",
      files,
      (id) => fileContents.get(id)?.content ?? "",
    );
    if (resolved?.rootId) {
      setTexworkspaceActiveFile(resolved.rootId);
    }
  }, [tabs, activeTabId, files, fileContents, setTexworkspaceActiveFile]);

  const getContent = useCallback(
    (id: string) => fileContents.get(id)?.content ?? "",
    [fileContents],
  );

  const { toc, labels, citations, texFiles } = useLatexStructure(files, getContent);

  // TeX file tree — strip manuscript/ prefix for display since we're already in manuscript context.
  // Keep original file IDs so click handlers still work.
  const texTree = useMemo(() => {
    const allUnderManuscript = texFiles.every((f) => f.relativePath.startsWith("manuscript/"));
    if (!allUnderManuscript) return buildFileTree(texFiles, []);
    const stripped = texFiles.map((f) => ({
      ...f,
      relativePath: f.relativePath.slice("manuscript/".length),
    }));
    return buildFileTree(stripped, []);
  }, [texFiles]);

  // ─── Handlers ───

  const handleTocSelect = useCallback(
    (entry: TocEntry) => {
      setTexworkspaceActiveFile(entry.fileId);
      setTimeout(() => requestJumpToLine(entry.fileId, entry.line), 80);
    },
    [setTexworkspaceActiveFile, requestJumpToLine],
  );

  const handleLabelSelect = useCallback(
    (entry: LabelEntry) => {
      setTexworkspaceActiveFile(entry.fileId);
      setTimeout(() => requestJumpToLine(entry.fileId, entry.line), 80);
    },
    [setTexworkspaceActiveFile, requestJumpToLine],
  );

  const handleCiteSelect = useCallback(
    (entry: CitationEntry) => {
      setTexworkspaceActiveFile(entry.fileId);
      setTimeout(() => requestJumpToLine(entry.fileId, entry.line), 80);
    },
    [setTexworkspaceActiveFile, requestJumpToLine],
  );

  const handleTexFileSelect = useCallback(
    (fileId: string) => {
      setTexworkspaceActiveFile(fileId);
    },
    [setTexworkspaceActiveFile],
  );

  // ─── Render ───

  const tocCount = toc.reduce((sum, e) => sum + 1 + countChildren(e), 0);

  // Word count — strip LaTeX commands and comments, count remaining words
  const wordCount = useMemo(() => {
    let total = 0;
    for (const f of texFiles) {
      const content = getContent(f.id);
      if (!content) continue;
      const stripped = content
        .replace(/%.*/g, " ")           // remove comments
        .replace(/\\(?:[a-zA-Z@]+|.)/g, " ") // remove commands
        .replace(/[\[\{][^}\]\[]*[\]\}]/g, " ") // remove brackets/braces content (simple)
        .replace(/[{}[\]]/g, " ");      // remove remaining braces/brackets
      const words = stripped.split(/\s+/).filter((w) => w.length > 0);
      total += words.length;
    }
    return total;
  }, [texFiles, getContent]);

  return (
    <>
      <SidebarHeader className="flex h-8 shrink-0 flex-row items-center justify-between px-3 py-0 gap-0">
        <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground truncate">
          Manuscript
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={`flex size-6 items-center justify-center rounded transition-colors ${
              sidebarTab === "structure"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title="Structure"
            onClick={() => setSidebarTab("structure")}
          >
            <FileTextIcon className="size-3.5" />
          </button>
          <button
            type="button"
            className={`flex size-6 items-center justify-center rounded transition-colors ${
              sidebarTab === "log"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            title="Compile Log"
            onClick={() => setSidebarTab("log")}
          >
            <ScrollTextIcon className="size-3.5" />
          </button>
          <span className="mx-0.5 h-3 w-px bg-border shrink-0" />
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            title={anyExpanded ? "Collapse All" : "Expand All"}
            onClick={anyExpanded ? collapseAll : expandAll}
          >
            {anyExpanded ? (
              <FoldVerticalIcon className="size-3.5" />
            ) : (
              <UnfoldVerticalIcon className="size-3.5" />
            )}
          </button>
        </div>
      </SidebarHeader>
      <SidebarContent className="overflow-auto px-1.5 py-1">
        {sidebarTab === "log" ? (
          <div className="p-2">
            {isCompiling ? (
              <p className="text-[length:var(--font-hint)] text-muted-foreground/60 text-center py-8">
                Compiling…
              </p>
            ) : compileLog ? (
              <pre className={`text-[length:var(--font-size-12)] whitespace-pre-wrap break-words font-mono ${compileError ? "text-destructive" : "text-muted-foreground"}`}>
                {compileLog}
              </pre>
            ) : (
              <p className="text-[length:var(--font-hint)] text-muted-foreground/60 text-center py-8">
                No compilation output yet
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Table of Contents */}
            <AccordionSection
              title="Table of Contents"
              icon={<HeadingIcon className="size-3" />}
              open={sections.toc}
              onToggle={() => toggleSection("toc")}
              badge={tocCount > 0 ? String(tocCount) : undefined}
            >
              {toc.length === 0 ? (
                <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No sections found
                </p>
              ) : (
                <TocTree entries={toc} depth={0} onSelect={handleTocSelect} />
              )}
            </AccordionSection>

            {/* Labels */}
            <AccordionSection
              title="Labels"
              icon={<TagIcon className="size-3" />}
              open={sections.labels}
              onToggle={() => toggleSection("labels")}
              badge={labels.length > 0 ? String(labels.length) : undefined}
            >
              {labels.length === 0 ? (
                <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No labels found
                </p>
              ) : (
                <div>
                  {labels.map((l, i) => (
                    <SidebarMenuButton
                      key={`${l.fileId}:${l.name}:${i}`}
                      size="sm"
                      onClick={() => handleLabelSelect(l)}
                      className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
                    >
                      {LABEL_ICON[l.kind]}
                      <span className="truncate">{l.name}</span>
                    </SidebarMenuButton>
                  ))}
                </div>
              )}
            </AccordionSection>

            {/* Cited References */}
            <AccordionSection
              title="Cited References"
              icon={<QuoteIcon className="size-3" />}
              open={sections.cites}
              onToggle={() => toggleSection("cites")}
              badge={citations.length > 0 ? String(citations.length) : undefined}
            >
              {citations.length === 0 ? (
                <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No citations found
                </p>
              ) : (
                <div>
                  {citations.map((c, i) => (
                    <SidebarMenuButton
                      key={`${c.fileId}:${c.key}:${i}`}
                      size="sm"
                      onClick={() => handleCiteSelect(c)}
                      title={c.author ? `${c.author}, ${c.title ?? c.key}${c.year ? ` (${c.year})` : ""}` : c.key}
                      className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
                    >
                      <QuoteIcon className="size-3 shrink-0" />
                      <span className="truncate">
                        {c.author ? (
                          <>{c.author}, <span className="text-muted-foreground/70">{c.title ?? c.key}</span>{c.year ? <span className="text-muted-foreground/50"> ({c.year})</span> : null}</>
                        ) : (
                          c.key
                        )}
                      </span>
                    </SidebarMenuButton>
                  ))}
                </div>
              )}
            </AccordionSection>

            {/* TeX Files */}
            <AccordionSection
              title="TeX Files"
              icon={<FileTextIcon className="size-3" />}
              open={sections.texfiles}
              onToggle={() => toggleSection("texfiles")}
              badge={texFiles.length > 0 ? String(texFiles.length) : undefined}
            >
              {texTree.length === 0 ? (
                <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No .tex files
                </p>
              ) : (
                <TexFileTree tree={texTree} depth={0} onSelect={handleTexFileSelect} />
              )}
            </AccordionSection>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="flex-row h-6 shrink-0 items-center justify-end px-3 py-0 gap-0 pb-1">
        <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums">
          {wordCount.toLocaleString()} words
        </span>
      </SidebarFooter>
    </>
  );
}

// ─── Helpers ───

function countChildren(e: TocEntry): number {
  return e.children.reduce((sum, c) => sum + 1 + countChildren(c), 0);
}

function TexFileTree({
  tree,
  depth,
  onSelect,
}: {
  tree: ReturnType<typeof buildFileTree>;
  depth: number;
  onSelect: (fileId: string) => void;
}) {
  return (
    <>
      {tree.map((node) => (
        <div key={node.relativePath}>
          {node.type === "folder" ? (
            <FolderNode node={node} depth={depth} onSelect={onSelect} />
          ) : (
            <SidebarMenuButton
              size="sm"
              onClick={() => onSelect(node.file?.id ?? node.relativePath)}
              className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
              style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
              <Icon
                icon={getFileIconName(node.name)}
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{node.name}</span>
            </SidebarMenuButton>
          )}
        </div>
      ))}
    </>
  );
}

function FolderNode({
  node,
  depth,
  onSelect,
}: {
  node: ReturnType<typeof buildFileTree>[number];
  depth: number;
  onSelect: (fileId: string) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <div>
      <SidebarMenuButton
        size="sm"
        onClick={() => setOpen(!open)}
        className="[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <ChevronRightIcon
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        <span className="truncate">{node.name}</span>
      </SidebarMenuButton>
      {open && node.children.length > 0 && (
        <TexFileTree tree={node.children} depth={depth + 1} onSelect={onSelect} />
      )}
    </div>
  );
}
