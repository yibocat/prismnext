import { useEffect, useMemo, useRef, useState } from "react";
import { filterLogEntries, useLogStore } from "@/stores/log-store";
import { logBuffer } from "@/services/logger";
import { cn } from "@/lib/utils";
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
} from "lucide-react";

const CATEGORIES: { value: LogCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "startup", label: "Startup" },
  { value: "git", label: "Git" },
  { value: "agent", label: "Agent" },
  { value: "compile", label: "Compile" },
  { value: "fs", label: "Files" },
  { value: "ipc", label: "IPC" },
  { value: "general", label: "General" },
];

/** Mutually exclusive level tabs — each shows only that level; All shows everything. */
const LEVELS: { value: LogLevel | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

const LEVEL_BADGE: Record<LogLevel, string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-blue-500/10 text-blue-500",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
  error: "bg-red-500/10 text-red-500",
};

const LEVEL_ROW_ACCENT: Record<LogLevel, string> = {
  debug: "",
  info: "",
  warn: "border-l-2 border-l-amber-500/40",
  error: "border-l-2 border-l-red-500/50 bg-red-500/[0.03]",
};

const LEVEL_DOT: Record<LogLevel, string> = {
  debug: "bg-muted-foreground/40",
  info: "bg-blue-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

function logEntryKey(entry: LogEntry): string {
  return `${entry.process}:${entry.id}:${entry.ts}:${entry.level}`;
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[length:var(--font-size-11)] font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
      title={level === "all" ? "Show all levels" : `Show ${level} only`}
    >
      {level !== "all" && (
        <span className={cn("size-1.5 rounded-full", LEVEL_DOT[level])} />
      )}
      <span className={level === "all" ? "" : "uppercase tracking-wide"}>{label}</span>
      {count !== undefined && (
        <span className="tabular-nums text-muted-foreground/70">{count}</span>
      )}
    </button>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.detail !== undefined && entry.detail !== null;
  const detailStr = useMemo(
    () => (hasDetail ? safeStringify(entry.detail) : ""),
    [hasDetail, entry.detail],
  );

  return (
    <button
      type="button"
      onClick={() => hasDetail && setExpanded((v) => !v)}
      className={cn(
        "group flex w-full items-start gap-2 bg-background px-3 py-1.5 text-left font-mono text-[length:var(--font-size-11)] leading-relaxed transition-colors",
        "hover:bg-muted/40",
        hasDetail && "cursor-pointer",
        LEVEL_ROW_ACCENT[entry.level],
      )}
    >
      <span className="shrink-0 tabular-nums text-muted-foreground/60 select-none">
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
      <span className="flex-1 min-w-0">
        <span className="break-all text-foreground/90">{entry.message}</span>
        <span className="ml-2 shrink-0 text-muted-foreground/50 text-[length:var(--font-size-10)]">
          {entry.process}:{entry.category} · {entry.module}
        </span>
        {hasDetail && expanded && detailStr && (
          <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-muted/50 px-2 py-1 text-[length:var(--font-size-11)] text-muted-foreground">
            {detailStr}
          </pre>
        )}
      </span>
    </button>
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
  const mainEntries = useLogStore((s) => s.mainEntries);
  const fetchMainLogs = useLogStore((s) => s.fetchMainLogs);

  // Local filter state — exclusive level tabs, scoped to this viewer instance.
  const [filterCategory, setFilterCategory] = useState<LogCategory | "all">("all");
  const [filterLevel, setFilterLevel] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filterKey = `${filterCategory}|${filterLevel}|${search}`;

  const visibleEntries = filterLogEntries(
    mainEntries,
    filterCategory,
    filterLevel,
    search,
  );

  useEffect(() => {
    void fetchMainLogs();
  }, [fetchMainLogs, filterCategory]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void fetchMainLogs(), 5000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchMainLogs, filterCategory]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [filterKey]);

  const counts = useMemo(() => {
    const all = [...mainEntries, ...logBuffer].sort((a, b) => a.ts - b.ts || a.id - b.id);
    const scoped =
      filterCategory === "all"
        ? all
        : all.filter((e) => e.category === filterCategory);
    const c: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of scoped) c[e.level] += 1;
    return { byLevel: c, total: scoped.length };
  }, [mainEntries, filterCategory]);

  const handleExport = () => {
    const lines: string[] = [];
    for (const e of visibleEntries) {
      const ts = new Date(e.ts).toISOString();
      const base = `${ts} [${e.level.toUpperCase()}] [${e.process}:${e.category}] ${e.module}: ${e.message}`;
      lines.push(e.detail !== undefined ? `${base} ${JSON.stringify(e.detail)}` : base);
    }
    const text = lines.join("\n");
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
        ? `No ${filterLevel} logs in the current view.`
        : "No logs match the current filters."
      : "No logs yet.";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <AppSelect
            value={filterCategory}
            onValueChange={(v) => setFilterCategory(v as LogCategory | "all")}
          >
            <AppSelectTrigger className="w-[6.5rem] shrink-0">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent className="min-w-[var(--radix-select-trigger-width)]">
              {CATEGORIES.map((c) => (
                <AppSelectItem key={c.value} value={c.value}>
                  {c.label}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>

          <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input bg-background px-2">
            <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages & modules…"
              className="min-w-0 flex-1 bg-transparent text-[length:var(--font-size-12)] outline-none placeholder:text-muted-foreground/50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          <button
            onClick={() => void fetchMainLogs()}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RotateCwIcon className="size-3.5" />
          </button>
          <button
            onClick={handleExport}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Export logs"
          >
            <DownloadIcon className="size-3.5" />
          </button>
        </div>

        {/* ── Level tabs (exclusive) ── */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            {LEVELS.map((l) => (
              <LevelChip
                key={l.value}
                level={l.value}
                label={l.label}
                active={filterLevel === l.value}
                count={l.value === "all" ? counts.total : counts.byLevel[l.value]}
                onClick={() => setFilterLevel(l.value)}
              />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[length:var(--font-size-11)] text-muted-foreground/70">
            <label className="inline-flex cursor-pointer select-none items-center gap-1">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="size-2.5 accent-primary"
              />
              Auto
            </label>
            <span className="tabular-nums">{visibleEntries.length} shown</span>
          </div>
        </div>

        {(errorCount > 0 || warnCount > 0) && filterLevel === "all" && (
          <div className="flex items-center gap-3 text-[length:var(--font-size-11)]">
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 text-red-500">
                <span className="size-1.5 rounded-full bg-red-500" />
                {errorCount} error{errorCount > 1 ? "s" : ""}
              </span>
            )}
            {warnCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {warnCount} warning{warnCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Log list — remount on filter change to drop stale painted rows ── */}
      <div
        key={filterKey}
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background [contain:paint]"
      >
        {visibleEntries.length === 0 ? (
          <div className="flex w-full flex-col items-start gap-2 px-6 py-10 text-muted-foreground/50">
            <ScrollTextIcon className="size-6" />
            <p className="text-[length:var(--font-size-12)]">{emptyMessage}</p>
            <p className="text-[length:var(--font-size-11)] text-muted-foreground/40">
              Activity from the main process and UI will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {visibleEntries.map((e) => (
              <LogRow key={logEntryKey(e)} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
