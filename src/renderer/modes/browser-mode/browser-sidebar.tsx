import { useState, useRef, useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useDocumentStore } from "@/stores/document-store";
import { navigateBrowserUrl, openUrlInBrowser } from "@/lib/browser-link";
import { BrowserFavicon } from "./browser-favicon";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  RefreshCwIcon,
  ExternalLinkIcon,
  PlusSquareIcon,
  PencilIcon,
  LinkIcon,
  ChevronRightIcon,
  StarIcon,
  XIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

function SidebarSectionTrigger({
  label,
  count,
  extraAction,
}: {
  label: string;
  count?: number;
  extraAction?: React.ReactNode;
}) {
  return (
    <AccordionTrigger
      className={cn(
        "h-7 py-0 px-0 rounded-sm text-muted-foreground hover:no-underline group",
        "[&>svg]:hidden",
      )}
    >
      <SidebarMenuButton
        size="sm"
        asChild
        className="[&>svg]:!size-3 h-7 w-full text-[length:var(--font-size-12)] rounded-sm text-muted-foreground"
      >
        <span className="flex items-center gap-1.5 w-full">
          <ChevronRightIcon className="size-3 shrink-0 group-data-[state=open]:rotate-90" />
          <span className="flex-1 text-left truncate">{label}</span>
          {count != null && count > 0 && (
            <span className="text-[length:var(--font-hint)] text-muted-foreground/60 tabular-nums shrink-0">
              {count}
            </span>
          )}
          {extraAction && (
            <span
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {extraAction}
            </span>
          )}
        </span>
      </SidebarMenuButton>
    </AccordionTrigger>
  );
}

export function BrowserSidebar() {
  const [accordionValue, setAccordionValue] = useState<string[]>(["bookmarks", "recent"]);

  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = useRightPanelStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const recentVisits = useBrowserStore((s) => s.recentVisits);
  const removeBookmark = useBrowserStore((s) => s.removeBookmark);
  const renameBookmark = useBrowserStore((s) => s.renameBookmark);
  const changeBookmarkUrl = useBrowserStore((s) => s.changeBookmarkUrl);
  const removeRecentVisit = useBrowserStore((s) => s.removeRecentVisit);
  const clearRecentVisits = useBrowserStore((s) => s.clearRecentVisits);
  const loadFromProject = useBrowserStore((s) => s.loadFromProject);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    type: "rename" | "url";
    value: string;
  } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const editConfirmRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!editing) return;
    let attempts = 0;
    const maxAttempts = 30;
    let raf = 0;
    const keepFocus = () => {
      if (attempts++ >= maxAttempts) return;
      if (document.activeElement !== editInputRef.current) {
        editInputRef.current?.focus();
      }
      if (attempts < 8 || document.activeElement !== editInputRef.current) {
        raf = requestAnimationFrame(keepFocus);
      }
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(keepFocus); }, 60);

    const onClickOutside = (e: MouseEvent) => {
      if (editInputRef.current && !editInputRef.current.contains(e.target as Node)) {
        editConfirmRef.current();
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [editing]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      projectRoot ? loadFromProject(projectRoot) : Promise.resolve(),
      new Promise((r) => setTimeout(r, 400)),
    ]);
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  };

  const handleNavigate = (url: string) => {
    if (activeTabId) {
      navigateBrowserUrl(activeTabId, url);
    } else {
      openUrlInBrowser(url);
    }
  };

  const handleOpenInNewTab = (url: string) => {
    openUrlInBrowser(url, { newTab: true });
  };

  const handleStartRename = (id: string, title: string) => {
    setEditing({ id, type: "rename", value: title });
  };

  const handleStartChangeUrl = (id: string, url: string) => {
    setEditing({ id, type: "url", value: url });
  };

  const handleEditConfirm = () => {
    if (!editing) return;
    const trimmed = editing.value.trim();
    if (!trimmed) { setEditing(null); return; }
    if (editing.type === "rename") {
      renameBookmark(editing.id, trimmed);
    } else {
      const final = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
      changeBookmarkUrl(editing.id, final);
    }
    setEditing(null);
  };
  editConfirmRef.current = handleEditConfirm;

  const handleEditCancel = () => setEditing(null);

  const isCurrentPage = (url: string) => activeTab?.url === url;

  const formatTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <>
      <SidebarHeader className="flex h-8 shrink-0 flex-row items-center px-3 py-0 gap-0">
        <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground truncate">
          Browser
        </span>
        <div className="flex-1" />
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-50"
          title="Refresh bookmarks and recent"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
      </SidebarHeader>

      <SidebarContent className="overflow-auto px-1.5 py-1">
        <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue}>
          <AccordionItem value="bookmarks" className="border-none">
            <SidebarSectionTrigger label="Bookmarks" count={bookmarks.length} />
            <AccordionContent animated={false} className="pb-0.5 pt-0">
              {bookmarks.length === 0 ? (
                <p className="px-3.5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No bookmarks yet
                </p>
              ) : (
                bookmarks.map((b) => (
                  <div key={b.id}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <SidebarMenuButton
                          size="sm"
                          onClick={() => handleNavigate(b.url)}
                          title={b.url}
                          className={cn(
                            "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground pl-3",
                            "group/bookmark",
                            isCurrentPage(b.url) && "bg-muted text-foreground",
                          )}
                        >
                          <BrowserFavicon key={`${b.id}-${refreshKey}`} url={b.url} />
                          {editing?.id === b.id && editing.type === "rename" ? (
                            <input
                              ref={editInputRef}
                              type="text"
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleEditConfirm();
                                if (e.key === "Escape") handleEditCancel();
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 bg-muted/50 px-1.5 rounded-sm text-[length:var(--font-size-12)] text-foreground outline-none min-w-0 ring-1 ring-border"
                            />
                          ) : (
                            <span className="truncate flex-1">{b.title}</span>
                          )}
                          {!(editing?.id === b.id && editing.type === "rename") && (
                            <button
                              type="button"
                              className="size-4 shrink-0 rounded-sm opacity-0 group-hover/bookmark:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeBookmark(b.id);
                              }}
                              title="Remove bookmark"
                            >
                              <StarIcon className="size-3 fill-warning text-warning" />
                            </button>
                          )}
                        </SidebarMenuButton>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => handleNavigate(b.url)}>
                          <ExternalLinkIcon />
                          Open
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleOpenInNewTab(b.url)}>
                          <PlusSquareIcon />
                          Open in New Tab
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => handleStartRename(b.id, b.title)}>
                          <PencilIcon />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleStartChangeUrl(b.id, b.url)}>
                          <LinkIcon />
                          Change URL
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    {editing?.id === b.id && editing.type === "url" && (
                      <div className="flex items-center gap-1 pl-3 h-6 py-0.5">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editing.value}
                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditConfirm();
                            if (e.key === "Escape") handleEditCancel();
                          }}
                          className="flex-1 h-5 bg-muted/50 px-1.5 rounded-sm text-[length:var(--font-size-12)] text-foreground outline-none min-w-0 ring-1 ring-border"
                          placeholder="https://..."
                        />
                        <button type="button" onClick={handleEditConfirm} className="text-[length:var(--font-hint)] text-primary hover:underline shrink-0">
                          OK
                        </button>
                        <button type="button" onClick={handleEditCancel} className="text-[length:var(--font-hint)] text-muted-foreground hover:underline shrink-0">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="recent" className="border-none">
            <SidebarSectionTrigger
              label="Recent"
              count={recentVisits.length}
              extraAction={
                recentVisits.length > 0 ? (
                  <button
                    type="button"
                    className="flex size-4 items-center justify-center rounded-sm text-muted-foreground/40 hover:text-muted-foreground hover:bg-accent transition-colors"
                    onClick={() => clearRecentVisits()}
                    title="Clear all recent"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                ) : undefined
              }
            />
            <AccordionContent animated={false} className="pb-0.5 pt-0">
              {recentVisits.length === 0 ? (
                <p className="px-3.5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
                  No recent visits
                </p>
              ) : (
                recentVisits.map((v, i) => (
                  <ContextMenu key={`${v.url}-${i}`}>
                    <ContextMenuTrigger asChild>
                      <SidebarMenuButton
                        size="sm"
                        onClick={() => handleNavigate(v.url)}
                        title={v.url}
                        className={cn(
                          "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground pl-3",
                          "group/recent",
                          isCurrentPage(v.url) && "bg-muted text-foreground",
                        )}
                      >
                        <BrowserFavicon key={`${v.url}-${refreshKey}`} url={v.url} />
                        <span className="truncate flex-1">{v.title}</span>
                        <span className="text-[length:var(--font-hint)] text-muted-foreground/40 tabular-nums mr-1 shrink-0">
                          {formatTime(v.visitedAt)}
                        </span>
                        <button
                          type="button"
                          className="size-4 shrink-0 rounded-sm opacity-0 group-hover/recent:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentVisit(v.url);
                          }}
                          title="Remove from recent"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </SidebarMenuButton>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleNavigate(v.url)}>
                        <ExternalLinkIcon />
                        Open
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleOpenInNewTab(v.url)}>
                        <PlusSquareIcon />
                        Open in New Tab
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SidebarContent>
    </>
  );
}
