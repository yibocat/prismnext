import { useState, useRef, useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useDocumentStore } from "@/stores/document-store";
import { getWebview } from "@/components/modules/browser/webview-registry";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ChevronRightIcon,
  GlobeIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  PlusSquareIcon,
  PencilIcon,
  LinkIcon,
  XIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Favicon ───

function getFaviconUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/favicon.ico`;
  } catch {
    return null;
  }
}

function Favicon({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = getFaviconUrl(url);

  if (failed || !src) {
    return <GlobeIcon className={cn("size-3 shrink-0 text-muted-foreground/40", className)} />;
  }

  // Try the standard favicon.ico at the domain root — works on any network
  // (intranet, China, anywhere) without depending on third-party services.
  // Preserves the original URL's protocol (http/https).
  return (
    <img
      src={src}
      alt=""
      className={cn("size-3 shrink-0", className)}
      onError={() => setFailed(true)}
    />
  );
}

// ─── AccordionSection (reused pattern from texworkspace-sidebar) ───

function AccordionSection({
  title,
  icon,
  open,
  onToggle,
  badge,
  extraAction,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  badge?: string;
  extraAction?: React.ReactNode;
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
        {extraAction}
      </SidebarMenuButton>
      {open && <SidebarMenu className="gap-0.5 pt-0.5 pb-0.5">{children}</SidebarMenu>}
    </div>
  );
}

// ─── Main Component ───

export function BrowserSidebar() {
  const [sections, setSections] = useState({ bookmarks: true, recent: true });
  const toggle = (key: keyof typeof sections) => setSections((s) => ({ ...s, [key]: !s[key] }));

  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const newBrowserTab = useRightPanelStore((s) => s.newBrowserTab);
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

  // Keep the inline edit input focused — Radix context menu animation
  // restores focus to the trigger AFTER our initial focus, so we retry
  // across several frames to reclaim it. Also confirm on click-outside.
  useEffect(() => {
    if (!editing) return;
    let attempts = 0;
    const maxAttempts = 30; // ~500ms at 60fps
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
    // Small initial delay to let the input mount first
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
    // Minimum 400ms spin so the animation is visible — local IPC is near-instant
    await Promise.all([
      projectRoot ? loadFromProject(projectRoot) : Promise.resolve(),
      new Promise((r) => setTimeout(r, 400)),
    ]);
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  };

  const handleNavigate = (url: string) => {
    if (activeTabId) {
      navigateBrowserTab(activeTabId, url);
      const wv = getWebview(activeTabId);
      if (wv) (wv as any).loadURL(url);
    } else {
      const newId = newBrowserTab();
      navigateBrowserTab(newId, url);
    }
  };

  const handleOpenInNewTab = (url: string) => {
    const newId = newBrowserTab();
    navigateBrowserTab(newId, url);
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

  const isCurrentPage = (url: string) => {
    return activeTab?.url === url;
  };

  const formatTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 disabled:opacity-50"
          title="Refresh bookmarks and recent"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
      </SidebarHeader>
      <SidebarContent className="overflow-auto px-1.5 py-1">
        {/* ── Bookmarks ── */}
        <AccordionSection
          title="Bookmarks"
          open={sections.bookmarks}
          onToggle={() => toggle("bookmarks")}
          badge={bookmarks.length > 0 ? String(bookmarks.length) : undefined}
        >
          {bookmarks.length === 0 ? (
            <p className="pl-5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
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
                        "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground pl-5",
                        "group/bookmark",
                        isCurrentPage(b.url) && "bg-muted text-foreground",
                      )}
                    >
                      <Favicon key={`${b.id}-${refreshKey}`} url={b.url} />
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
                          <XIcon className="size-3" />
                        </button>
                      )}
                    </SidebarMenuButton>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-44">
                    <ContextMenuItem onClick={() => handleNavigate(b.url)}>
                      <ExternalLinkIcon className="size-3.5 mr-2" />
                      Open
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleOpenInNewTab(b.url)}>
                      <PlusSquareIcon className="size-3.5 mr-2" />
                      Open in New Tab
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => handleStartRename(b.id, b.title)}>
                      <PencilIcon className="size-3.5 mr-2" />
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleStartChangeUrl(b.id, b.url)}>
                      <LinkIcon className="size-3.5 mr-2" />
                      Change URL
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                {/* Inline URL edit row */}
                {editing?.id === b.id && editing.type === "url" && (
                  <div className="flex items-center gap-1 pl-5 h-6 py-0.5">
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
                    <button
                      type="button"
                      onClick={handleEditConfirm}
                      className="text-[length:var(--font-hint)] text-primary hover:underline shrink-0"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={handleEditCancel}
                      className="text-[length:var(--font-hint)] text-muted-foreground hover:underline shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </AccordionSection>

        {/* ── Recent ── */}
        <AccordionSection
          title="Recent"
          open={sections.recent}
          onToggle={() => toggle("recent")}
          badge={recentVisits.length > 0 ? String(recentVisits.length) : undefined}
          extraAction={
            recentVisits.length > 0 ? (
              <button
                type="button"
                className="size-4 shrink-0 rounded-sm opacity-60 hover:opacity-100 hover:bg-muted-foreground/20 flex items-center justify-center ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  clearRecentVisits();
                }}
                title="Clear all recent"
              >
                <Trash2Icon className="size-3" />
              </button>
            ) : undefined
          }
        >
          {recentVisits.length === 0 ? (
            <p className="pl-5 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
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
                      "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground pl-5",
                      "group/recent",
                      isCurrentPage(v.url) && "bg-muted text-foreground",
                    )}
                  >
                    <Favicon key={`${v.url}-${refreshKey}`} url={v.url} />
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
                <ContextMenuContent className="w-44">
                  <ContextMenuItem onClick={() => handleNavigate(v.url)}>
                    <ExternalLinkIcon className="size-3.5 mr-2" />
                    Open
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleOpenInNewTab(v.url)}>
                    <PlusSquareIcon className="size-3.5 mr-2" />
                    Open in New Tab
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))
          )}
        </AccordionSection>
      </SidebarContent>

    </>
  );
}
