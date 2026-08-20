import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { filterLogEntries, formatLogCopy, useLogStore } from "@/stores/log-store";
import { useSettingsStore } from "@/stores/settings-store";
import { logBuffer } from "@/services/logger";
import { cn, writeClipboardText } from "@/lib/utils";
import {
  useLiteratureListMarquee,
  type MarqueeRect,
} from "@/lib/literature/literature-list-marquee";
import type { LogLevel, LogCategory, LogEntry } from "@shared/log-types";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  SearchIcon,
  DownloadIcon,
  RotateCwIcon,
  XIcon,
  ScrollTextIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { Hint } from "@/components/ui/hint";

const CATEGORY_VALUES: Array<LogCategory | "all"> = [
  "all",
  "startup",
  "git",
  "agent",
  "compile",
  "fs",
  "ipc",
  "crash",
  "security",
  "general",
];

/** Exact-level tabs — Debug shows only debug. */
const LEVEL_VALUES: Array<LogLevel | "all"> = ["all", "debug", "info", "warn", "error"];
const CAPTURE_LEVELS: LogLevel[] = ["info", "debug"];
const LOG_VIEWER_POLL_MS = 2000;
const COPIED_MS = 1500;

const LEVEL_BADGE: Record<LogLevel, string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-secondary text-secondary-foreground",
  warn: "bg-warning text-warning-foreground",
  error: "bg-destructive text-destructive-foreground",
};

const LEVEL_ROW_ACCENT: Record<LogLevel, string> = {
  debug: "",
  info: "",
  warn: "border-l-2 border-l-warning",
  error: "border-l-2 border-l-destructive",
};

const LEVEL_DOT: Record<LogLevel, string> = {
  debug: "bg-muted-foreground",
  info: "bg-primary",
  warn: "bg-warning",
  error: "bg-destructive",
};

export function logEntryKey(entry: LogEntry): string {
  return `${entry.process}:${entry.id}:${entry.ts}:${entry.level}`;
}

function useSelectedUnionBox(
  scrollRef: { current: HTMLDivElement | null },
  selectedKeys: Set<string>,
): MarqueeRect | null {
  const [box, setBox] = useState<MarqueeRect | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const root = scrollRef.current;
      if (!root || selectedKeys.size === 0) {
        setBox(null);
        return;
      }
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      let hit = false;
      for (const el of root.querySelectorAll<HTMLElement>("[data-log-key]")) {
        const key = el.dataset.logKey;
        if (!key || !selectedKeys.has(key)) continue;
        const rect = el.getBoundingClientRect();
        hit = true;
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }
      setBox(hit ? { left, top, width: right - left, height: bottom - top } : null);
    };

    update();
    const root = scrollRef.current;
    root?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      root?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrollRef, selectedKeys]);

  return box;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function LevelChip({
  level,
  label,
  active,
  count,
  onClick,
}: {
  level: LogLevel | "all";
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const levelLabel =
    level === "all"
      ? t("settings.editor.logs.showAllLevels")
      : t("settings.editor.logs.showLevelOnly", { level });

  return (
    <Hint label={levelLabel}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[length:var(--font-size-11)] font-medium transition-colors",
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {level !== "all" && (
          <span className={cn("size-1.5 rounded-full", LEVEL_DOT[level])} />
        )}
        <span className={level === "all" ? "" : "uppercase tracking-wide"}>{label}</span>
        {count !== undefined && (
          <span className="tabular-nums text-muted-foreground">{count}</span>
        )}
      </button>
    </Hint>
  );
}

function LogRow({
  entry,
  copied,
  onCopy,
  suppressClickRef,
}: {
  entry: LogEntry;
  copied: boolean;
  onCopy: () => void;
  suppressClickRef: { current: boolean };
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.detail !== undefined && entry.detail !== null;
  const detailStr = useMemo(
    () => (hasDetail ? safeStringify(entry.detail) : ""),
    [hasDetail, entry.detail],
  );

  return (
    <div
      data-log-row
      data-log-key={logEntryKey(entry)}
      className={cn(
        "group bg-background px-3 py-1.5 text-left font-mono text-[length:var(--font-size-11)] leading-relaxed",
        hasDetail && "cursor-pointer",
        LEVEL_ROW_ACCENT[entry.level],
      )}
      onClick={() => {
        if (suppressClickRef.current) return;
        if (!hasDetail) return;
        setExpanded((v) => !v);
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 select-none tabular-nums text-muted-foreground">
          {formatTime(entry.ts)}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-px text-[length:var(--font-size-10)] font-semibold uppercase tracking-wide",
            LEVEL_BADGE[entry.level],
          )}
        >
          {entry.level}
        </span>
        <span className="min-w-0 break-all text-foreground">{entry.message}</span>
        <span className="shrink-0 text-[length:var(--font-size-10)] text-muted-foreground">
          {entry.process}:{entry.category} · {entry.module}
        </span>
        <Hint label={copied ? t("settings.editor.logs.copied") : t("settings.editor.logs.copyRow")}>
          <button
            type="button"
            data-log-copy
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className={cn(
              "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-opacity",
              "pointer-events-none opacity-0",
              "group-hover:pointer-events-auto group-hover:opacity-100",
              copied && "pointer-events-auto opacity-100",
            )}
          >
            {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
          </button>
        </Hint>
      </div>
      {hasDetail && expanded && detailStr && (
        <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 text-[length:var(--font-size-11)] text-muted-foreground">
          {detailStr}
        </pre>
      )}
    </div>
  );
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function LogViewer() {
  const { t } = useTranslation();
  const mainEntries = useLogStore((s) => s.mainEntries);
  const fetchMainLogs = useLogStore((s) => s.fetchMainLogs);
  const exportLogs = useLogStore((s) => s.exportLogs);
  const logMinLevel = useSettingsStore((s) => s.settings.logMinLevel ?? "info");
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [filterCategory, setFilterCategory] = useState<LogCategory | "all">("all");
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterKey = `${filterCategory}|${filterLevel}|${search}`;

  const visibleEntries = useMemo(
    () => filterLogEntries(mainEntries, filterCategory, filterLevel, search),
    [mainEntries, filterCategory, filterLevel, search],
  );

  const selectedIds = useMemo(() => [...selectedKeys], [selectedKeys]);
  const setSelectedIds = useCallback((ids: string[]) => {
    setSelectedKeys(new Set(ids));
  }, []);

  const { marqueeRect, suppressRowClickRef } = useLiteratureListMarquee({
    scrollRef,
    listBodyRef,
    checkedPaperIds: selectedIds,
    setCheckedPaperIds: setSelectedIds,
    enabled: visibleEntries.length > 0,
    rowSelector: "[data-log-row]",
    idDatasetKey: "logKey",
    ignoreSelector: "[data-log-copy]",
  });
  const selectedUnion = useSelectedUnionBox(scrollRef, selectedKeys);

  const selectedEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedKeys.has(logEntryKey(entry))),
    [visibleEntries, selectedKeys],
  );

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  useEffect(() => {
    void fetchMainLogs();
  }, [fetchMainLogs, filterCategory]);

  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = setInterval(() => void fetchMainLogs(), LOG_VIEWER_POLL_MS);
    return () => clearInterval(intervalId);
  }, [autoRefresh, fetchMainLogs, filterCategory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setSelectedKeys(new Set());
  }, [filterKey]);

  useEffect(() => {
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleEntries.map(logEntryKey));
      const next = new Set<string>();
      for (const key of prev) {
        if (visible.has(key)) next.add(key);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [visibleEntries]);

  const markCopied = useCallback((token: string) => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    setCopiedToken(token);
    copiedTimerRef.current = setTimeout(() => setCopiedToken(null), COPIED_MS);
  }, []);

  const copyEntries = useCallback(
    async (entries: LogEntry[], token: string) => {
      if (entries.length === 0) return;
      const ok = await writeClipboardText(formatLogCopy(entries));
      if (ok) markCopied(token);
    },
    [markCopied],
  );

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (selectedKeys.size === 0) return;
        event.preventDefault();
        clearSelection();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "c" && selectedEntries.length > 0) {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        void copyEntries(selectedEntries, "selection");
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (selectedKeys.size === 0) return;
      clearSelection();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [clearSelection, copyEntries, selectedEntries, selectedKeys.size]);

  const counts = useMemo(() => {
    const all = [...mainEntries, ...logBuffer];
    const scoped =
      filterCategory === "all"
        ? all
        : all.filter((e) => e.category === filterCategory);
    const c: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of scoped) c[e.level] += 1;
    return { byLevel: c, total: scoped.length };
  }, [mainEntries, filterCategory]);

  const handleExport = () => {
    const text = exportLogs({
      category: filterCategory,
      level: filterLevel,
      search,
    });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-next-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = counts.byLevel.error;
  const warnCount = counts.byLevel.warn;

  const emptyMessage =
    search || filterCategory !== "all" || filterLevel !== "all"
      ? filterLevel !== "all"
        ? t("settings.editor.logs.emptyLevel", { level: filterLevel })
        : t("settings.editor.logs.emptyFiltered")
      : t("settings.editor.logs.empty");

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        clearSelection();
      }}
      className="flex h-full min-h-0 flex-col bg-background outline-none"
    >
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <AppSelect
            value={filterCategory}
            onValueChange={(v) => setFilterCategory(v as LogCategory | "all")}
          >
            <AppSelectTrigger className="w-[7.25rem] shrink-0">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent className="min-w-[var(--radix-select-trigger-width)]">
              {CATEGORY_VALUES.map((value) => (
                <AppSelectItem key={value} value={value}>
                  {t(`settings.editor.logs.category.${value}`)}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-background px-2">
            <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("settings.editor.logs.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-[length:var(--font-size-12)] outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <Hint label={t("settings.editor.logs.clearSearch")}>
                <button
                  onClick={() => setSearch("")}
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </Hint>
            )}
          </div>

          <Hint label={t("settings.editor.logs.refresh")}>
            <button
              onClick={() => void fetchMainLogs()}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCwIcon className="size-3.5" />
            </button>
          </Hint>
          {selectedEntries.length > 0 && (
            <Hint label={t("settings.editor.logs.copySelected", { count: selectedEntries.length })}>
              <button
                onClick={() => void copyEntries(selectedEntries, "selection")}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copiedToken === "selection" ? (
                  <CheckIcon className="size-3.5 text-success" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </button>
            </Hint>
          )}
          <Hint label={t("settings.editor.logs.export")}>
            <button
              onClick={handleExport}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <DownloadIcon className="size-3.5" />
            </button>
          </Hint>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            {LEVEL_VALUES.map((value) => (
              <LevelChip
                key={value}
                level={value}
                label={t(`settings.editor.logs.level.${value}`)}
                active={filterLevel === value}
                count={value === "all" ? counts.total : counts.byLevel[value]}
                onClick={() => setFilterLevel(value)}
              />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[length:var(--font-size-11)] text-muted-foreground">
            <div className="inline-flex items-center gap-1">
              <span>{t("settings.editor.logs.capture")}</span>
              <AppSelect
                value={logMinLevel === "debug" ? "debug" : "info"}
                onValueChange={(v) => void updateSettings({ logMinLevel: v as LogLevel })}
              >
                <AppSelectTrigger className="h-6 w-[4.75rem] shrink-0">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent className="min-w-[var(--radix-select-trigger-width)]">
                  {CAPTURE_LEVELS.map((value) => (
                    <AppSelectItem key={value} value={value}>
                      {t(`settings.editor.logs.level.${value}`)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
            <label className="inline-flex cursor-pointer select-none items-center gap-1">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="size-2.5 accent-primary"
              />
              {t("settings.editor.logs.auto")}
            </label>
            <span className="tabular-nums">
              {t("settings.editor.logs.shown", { count: visibleEntries.length })}
            </span>
          </div>
        </div>

        {(errorCount > 0 || warnCount > 0) && filterLevel === "all" && (
          <div className="flex items-center gap-3 text-[length:var(--font-size-11)]">
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                {t("settings.editor.logs.errors", { count: errorCount })}
              </span>
            )}
            {warnCount > 0 && (
              <span className="inline-flex items-center gap-1 text-warning">
                <span className="size-1.5 rounded-full bg-warning" />
                {t("settings.editor.logs.warnings", { count: warnCount })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {typeof document !== "undefined" &&
          marqueeRect &&
          createPortal(
            <div
              aria-hidden
              className="pointer-events-none fixed z-[100] border border-primary/50 bg-primary/10"
              style={{
                left: marqueeRect.left,
                top: marqueeRect.top,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />,
            document.body,
          )}
        {typeof document !== "undefined" &&
          !marqueeRect &&
          selectedUnion &&
          createPortal(
            <div
              aria-hidden
              className="pointer-events-none fixed z-[90] border border-primary"
              style={{
                left: selectedUnion.left,
                top: selectedUnion.top,
                width: selectedUnion.width,
                height: selectedUnion.height,
              }}
            />,
            document.body,
          )}
        <div
          ref={scrollRef}
          className={cn(
            "h-full overflow-y-auto overscroll-contain bg-background",
            marqueeRect && "select-none",
          )}
          onClick={(event) => {
            if (suppressRowClickRef.current) return;
            const target = event.target as HTMLElement;
            if (target.closest("[data-log-row]")) return;
            clearSelection();
          }}
        >
          <div ref={listBodyRef} className="min-h-full">
            {visibleEntries.length === 0 ? (
              <div className="flex w-full flex-col items-start gap-2 px-6 py-10 text-muted-foreground">
                <ScrollTextIcon className="size-6" />
                <p className="text-[length:var(--font-size-12)]">{emptyMessage}</p>
                <p className="text-[length:var(--font-size-11)]">
                  {t("settings.editor.logs.activityHint")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {visibleEntries.map((entry) => {
                  const key = logEntryKey(entry);
                  return (
                    <LogRow
                      key={key}
                      entry={entry}
                    copied={copiedToken === key}
                      onCopy={() => void copyEntries([entry], key)}
                      suppressClickRef={suppressRowClickRef}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
