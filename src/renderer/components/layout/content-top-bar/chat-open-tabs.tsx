import { memo, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { resolveSessionTitle } from "@/lib/chat/session-title";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { Hint } from "@/components/ui/hint";
import { SessionContextCard } from "./session-context-card";
import { SortableTabStrip } from "@/components/layout/sortable-tab-strip";

/** Re-render strip only when tab display fields change — not on draft edits. */
function selectOpenTabsRenderKey(state: {
  tabs: Array<{
    id: string;
    title: string;
    isStreaming: boolean;
    sessionId: string | null;
    sessionCwd?: string | null;
    messages: unknown[];
  }>;
  activeTabId: string;
}): string {
  const parts: string[] = [];
  for (const t of state.tabs) {
    const resolved = resolveSessionTitle(t) ?? "";
    parts.push(
      `${t.id}\x01${t.title}\x01${t.isStreaming ? 1 : 0}\x01${t.sessionId ?? ""}\x01${t.sessionCwd ?? ""}\x01${resolved}`,
    );
  }
  parts.push(`active:${state.activeTabId}`);
  return parts.join("\0");
}

/** Visible open-chat strip only when the user actually has parallel tabs. */
export function shouldShowChatOpenTabs(tabCount: number): boolean {
  return tabCount >= 2;
}

export const ChatOpenTabs = memo(function ChatOpenTabs() {
  const { t } = useTranslation();
  const tabsRenderKey = useChatStore(selectOpenTabsRenderKey);
  const tabs = useMemo(
    () => useChatStore.getState().tabs,
    [tabsRenderKey],
  );
  const activeTabId = useChatStore((s) => s.activeTabId);
  const setActiveTab = useChatStore((s) => s.setActiveTab);
  const closeTab = useChatStore((s) => s.closeTab);
  const moveTab = useChatStore((s) => s.moveTab);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Vertical wheel → horizontal scroll when the strip overflows (trackpads / mice).
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }, []);

  if (!shouldShowChatOpenTabs(tabs.length)) return null;

  return (
    <SortableTabStrip
      ref={scrollerRef}
      items={tabs}
      getKey={(tab) => tab.id}
      onReorder={moveTab}
      onDragItem={(tab) => setActiveTab(tab.id)}
      className="min-w-0 w-0 flex-1"
      rowClassName="gap-0.5 overflow-x-auto overscroll-x-contain scrollbar-none"
      aria-label={t("chat.openTabs.label")}
      onWheel={onWheel}
      renderItem={({ item: tab, dragging, dragHandleProps }) => {
        const rawTitle = resolveSessionTitle(tab) ?? tab.title;
        const title = displayChatTitle(rawTitle, t);
        const active = tab.id === activeTabId;
        const streaming = tab.isStreaming;
        const canClose = !streaming && tabs.length > 1;

        return (
          <SessionContextCard
            tabId={tab.id}
            title={title}
            sessionId={tab.sessionId}
            sessionDirectory={tab.sessionCwd}
          >
            <div
              {...dragHandleProps}
              role="button"
              aria-pressed={active}
              tabIndex={0}
              className={cn(
                "group flex h-6 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-md px-1.5",
                "text-[length:var(--font-chat-meta)] select-none transition-colors cursor-default",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                dragging && "opacity-40",
              )}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActiveTab(tab.id);
                }
              }}
            >
              {streaming ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-primary animate-pulse"
                  aria-hidden
                />
              ) : null}
              <span className="min-w-0 truncate">{title}</span>
              <Hint
                label={
                  streaming
                    ? t("chat.openTabs.closeDisabledStreaming")
                    : t("chat.openTabs.close")
                }
              >
                <button
                  type="button"
                  disabled={!canClose}
                  className={cn(
                    "ml-0.5 flex size-4 shrink-0 items-center justify-center rounded",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    "hover:bg-muted-foreground/15 disabled:pointer-events-none disabled:opacity-30",
                    active && "opacity-70",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canClose) closeTab(tab.id);
                  }}
                >
                  <XIcon className="size-2.5" />
                </button>
              </Hint>
            </div>
          </SessionContextCard>
        );
      }}
    />
  );
});
