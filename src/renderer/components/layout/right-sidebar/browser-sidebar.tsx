import { useState } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { getWebview } from "@/components/modules/browser/webview-registry";
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  ChevronRightIcon,
  StarIcon,
  ClockIcon,
  GlobeIcon,
  XIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
      {open && <SidebarMenu className="gap-0.5 pb-0.5">{children}</SidebarMenu>}
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
  const removeRecentVisit = useBrowserStore((s) => s.removeRecentVisit);
  const clearRecentVisits = useBrowserStore((s) => s.clearRecentVisits);

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
      </SidebarHeader>
      <SidebarContent className="overflow-auto px-1.5 py-1">
        {/* ── Bookmarks ── */}
        <AccordionSection
          title="Bookmarks"
          icon={<StarIcon className="size-3" />}
          open={sections.bookmarks}
          onToggle={() => toggle("bookmarks")}
          badge={bookmarks.length > 0 ? String(bookmarks.length) : undefined}
        >
          {bookmarks.length === 0 ? (
            <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
              No bookmarks yet
            </p>
          ) : (
            bookmarks.map((b) => (
              <SidebarMenuButton
                key={b.id}
                size="sm"
                onClick={() => handleNavigate(b.url)}
                title={b.url}
                className={cn(
                  "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground",
                  "group/bookmark",
                  isCurrentPage(b.url) && "bg-muted text-foreground",
                )}
              >
                <GlobeIcon className="size-3 shrink-0" />
                <span className="truncate flex-1">{b.title}</span>
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
              </SidebarMenuButton>
            ))
          )}
        </AccordionSection>

        {/* ── Recent ── */}
        <AccordionSection
          title="Recent"
          icon={<ClockIcon className="size-3" />}
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
            <p className="px-3 py-2 text-[length:var(--font-hint)] text-muted-foreground/60">
              No recent visits
            </p>
          ) : (
            recentVisits.map((v, i) => (
              <SidebarMenuButton
                key={`${v.url}-${i}`}
                size="sm"
                onClick={() => handleNavigate(v.url)}
                title={v.url}
                className={cn(
                  "[&>svg]:!size-3 h-6 py-0.5 text-[length:var(--font-size-12)] rounded-sm text-muted-foreground",
                  "group/recent",
                  isCurrentPage(v.url) && "bg-muted text-foreground",
                )}
              >
                <GlobeIcon className="size-3 shrink-0" />
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
            ))
          )}
        </AccordionSection>
      </SidebarContent>
    </>
  );
}
