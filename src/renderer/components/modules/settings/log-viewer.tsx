import { useEffect, useMemo } from "react";
import { useLogStore } from "@/stores/log-store";
import { cn } from "@/lib/utils";
import type { LogLevel, LogCategory } from "@shared/log-types";
import {
  SearchIcon,
  DownloadIcon,
  RotateCwIcon,
  XIcon,
} from "lucide-react";

const CATEGORIES: { value: LogCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "startup", label: "Startup" },
  { value: "git", label: "Git" },
  { value: "agent", label: "Agent" },
  { value: "compile", label: "Compile" },
  { value: "fs", label: "Filesystem" },
  { value: "ipc", label: "IPC" },
  { value: "general", label: "General" },
];

const LEVELS: { value: LogLevel; label: string }[] = [
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-muted-foreground/60",
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

const LEVEL_BG: Record<LogLevel, string> = {
  debug: "",
  info: "",
  warn: "bg-amber-500/5",
  error: "bg-red-500/5",
};

export function LogViewer() {
  const filterCategory = useLogStore((s) => s.filterCategory);
  const filterLevel = useLogStore((s) => s.filterLevel);
  const search = useLogStore((s) => s.search);
  const entries = useLogStore((s) => s.entries);
  const setFilterCategory = useLogStore((s) => s.setFilterCategory);
  const setFilterLevel = useLogStore((s) => s.setFilterLevel);
  const setSearch = useLogStore((s) => s.setSearch);
  const fetchMainLogs = useLogStore((s) => s.fetchMainLogs);
  const exportLogs = useLogStore((s) => s.exportLogs);
  const refresh = useLogStore((s) => s.refresh);

  // Pull main process logs and auto-refresh on mount
  useEffect(() => {
    fetchMainLogs();
    const t = setInterval(fetchMainLogs, 5000);
    return () => clearInterval(t);
  }, [fetchMainLogs]);

  // Refresh when filters change
  useEffect(() => { refresh(); }, [filterCategory, filterLevel, search, refresh]);

  const handleExport = () => {
    const text = exportLogs();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prism-next-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entryLines = useMemo(() => {
    return entries.map((e) => {
      const ts = new Date(e.ts).toLocaleTimeString("en-US", { hour12: false });
      return {
        ...e,
        line: `${ts}  [${e.level.toUpperCase()}]  [${e.process}:${e.category}]  ${e.module}  ${e.message}`,
      };
    });
  }, [entries]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0 border-b border-border">
        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as LogCategory | "all")}
          className="h-7 rounded border border-border bg-transparent px-2 text-[length:var(--font-size-12)] text-muted-foreground outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        {/* Level filter */}
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value as LogLevel)}
          className="h-7 rounded border border-border bg-transparent px-2 text-[length:var(--font-size-12)] text-muted-foreground outline-none"
        >
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        {/* Search */}
        <div className="flex items-center gap-1 flex-1">
          <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 h-7 bg-transparent text-[length:var(--font-size-12)] outline-none placeholder:text-muted-foreground/40"
          />
          {search && (
            <button onClick={() => setSearch("")} className="p-0.5 text-muted-foreground hover:text-foreground">
              <XIcon className="size-3" />
            </button>
          )}
        </div>

        <span className="text-[length:var(--font-size-11)] text-muted-foreground/50">
          {entries.length} entries
        </span>

        <button onClick={() => fetchMainLogs()} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Refresh">
          <RotateCwIcon className="size-3.5" />
        </button>

        <button onClick={handleExport} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Export logs">
          <DownloadIcon className="size-3.5" />
        </button>
      </div>

      {/* ── Log lines ── */}
      <div className="flex-1 overflow-auto font-mono text-[length:var(--font-size-11)] leading-relaxed">
        {entryLines.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground/50">
            No logs match the current filters
          </div>
        ) : (
          entryLines.map((e) => (
            <div
              key={e.id}
              className={cn(
                "px-4 py-px whitespace-pre-wrap break-all",
                LEVEL_COLORS[e.level],
                LEVEL_BG[e.level],
                e.level === "error" && "font-medium",
              )}
            >
              {e.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
