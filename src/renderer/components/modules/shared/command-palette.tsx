import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { MessageSquareIcon, BookIcon, BookOpenIcon, Loader2Icon, SparklesIcon, FilePlusIcon, MessageSquarePlusIcon, FlaskConicalIcon, GlobeIcon, HistoryIcon, XIcon } from "lucide-react";
import { getFileIcon } from "@/lib/files/file-tree";
import { getRecentOpenedFilesForProject } from "@/lib/files/recent-files";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { openUrlInBrowser } from "@/lib/browser-link";
import { toast } from "sonner";
import { useLiteratureStore } from "@/stores/literature-store";
import type { LiteraturePaper } from "@/types/electron.d";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { SETTINGS_GROUPS } from "@/components/modules/settings/settings-sidebar";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { openRightArea, toggleRightAreaMaximize } from "@/lib/workspace/right-area-layout";
import { openPaperPdfReader, openPaperInMainLibrary } from "@/lib/literature/open-paper-in-library";
import { paperHasReadablePdf } from "@/modes/literature-mode/literature-format";
import { fuzzyMatch } from "@/lib/search/fuzzy";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from "@/lib/search/history";
import { formatRelativeTimeMs } from "@/lib/chat/relative-time";
import { cn } from "@/lib/utils";
import { ShortcutKbdChips } from "@/lib/shortcuts";
import { Kbd } from "@/components/ui/kbd";

export interface CommandPanelRefs {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

interface SessionListItem {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  directory?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelRefs: CommandPanelRefs;
  isMobile?: boolean;
}

const CATEGORIES = [
  { id: "all", labelKey: "shell.command.cat.all", fallback: "All" },
  { id: "files", labelKey: "shell.command.cat.files", fallback: "Files" },
  { id: "sessions", labelKey: "shell.command.cat.sessions", fallback: "Sessions" },
  { id: "history", labelKey: "shell.command.cat.history", fallback: "History" },
  { id: "literature", labelKey: "shell.command.cat.literature", fallback: "Literature" },
  { id: "modes", labelKey: "shell.command.cat.modes", fallback: "Modes" },
  { id: "settings", labelKey: "shell.command.cat.settings", fallback: "Settings" },
] as const;

type Category = (typeof CATEGORIES)[number]["id"];

/** cmdk filter that passes every item (we render-filter ourselves). */
const passAllFilter = (): number => 1;

/** mode id -> shortcut id (right-side kbd on mode items). */
const MODE_SHORTCUT: Partial<Record<string, string>> = {
  texworkspace: "workspace.openTexWorkspace",
  literature: "workspace.openLiterature",
  experiments: "workspace.openExperiments",
  files: "workspace.openFiles",
  git: "workspace.openGit",
  browser: "workspace.openBrowser",
  terminal: "workspace.openTerminal",
};

const FILE_LIMIT_ALL = 8;
const FILE_LIMIT_SINGLE = 30;
const SESSION_LIMIT_ALL = 6;
const SESSION_LIMIT_SINGLE = 20;

export function CommandPalette({ open, onOpenChange, panelRefs, isMobile }: CommandPaletteProps) {
  const { t } = useTranslation();
  const { centerRef, rightAreaRef } = panelRefs;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");

  useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("all");
    }
  }, [open]);

  const close = () => onOpenChange(false);
  const run = (fn: () => void) => {
    // Record the query as a successful search (per-project history).
    if (query.trim()) {
      addSearchHistory(projectRoot, query);
      setHistoryVersion((v) => v + 1);
    }
    fn();
    close();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const idx = CATEGORIES.findIndex((c) => c.id === category);
      const next = e.shiftKey
        ? (idx - 1 + CATEGORIES.length) % CATEGORIES.length
        : (idx + 1) % CATEGORIES.length;
      setCategory(CATEGORIES[next].id);
    }
  };

  // Track Shift+Enter so onSelect can open the target maximized (window capture
  // runs before cmdk's Enter handler, so the flag is set in time).
  const shiftEnterRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter" && e.shiftKey) shiftEnterRef.current = true;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const consumeMaximize = () => {
    const m = shiftEnterRef.current;
    shiftEnterRef.current = false;
    return m;
  };

  const hasQuery = query !== "";
  const isAll = category === "all";
  const showRecentLayout = isAll && !hasQuery;

  // ── Sessions (sorted by lastModified desc) ──
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  useEffect(() => {
    if (!open || !projectRoot) {
      setSessions([]);
      return;
    }
    let cancelled = false;
    window.electronAPI
      .sessionList(projectRoot)
      .then((list) => {
        if (!cancelled) setSessions(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectRoot]);

  const sessionsSorted = useMemo(
    () => [...sessions].sort((a, b) => b.lastModified - a.lastModified),
    [sessions],
  );

  // ── Recent files (per-project recent-opened list, still present in the tree) ──
  const recentFileItems = useMemo(() => {
    if (!projectRoot) return [] as ProjectFile[];
    const recent = getRecentOpenedFilesForProject(projectRoot);
    const fileById = new Map(files.map((f) => [f.id, f]));
    return recent.filter((r) => fileById.has(r.id)).slice(0, 5).map((r) => fileById.get(r.id)!);
  }, [projectRoot, files]);

  // ── File items to render ──
  const showFiles = category === "files" || (isAll && hasQuery);
  const fileLimit = isAll ? FILE_LIMIT_ALL : FILE_LIMIT_SINGLE;
  const fileItems = useMemo(() => {
    if (showRecentLayout) return recentFileItems;
    if (!showFiles) return [];
    const out: ProjectFile[] = [];
    for (const f of files) {
      if (!hasQuery || fuzzyMatch(query, f.name) || fuzzyMatch(query, f.relativePath)) {
        out.push(f);
        if (out.length >= fileLimit) break;
      }
    }
    return out;
  }, [showRecentLayout, recentFileItems, showFiles, files, hasQuery, query, fileLimit]);

  // ── Session items to render ──
  const showSessions = category === "sessions" || (isAll && hasQuery);
  const sessionLimit = isAll ? SESSION_LIMIT_ALL : SESSION_LIMIT_SINGLE;
  const sessionItems = useMemo(() => {
    if (showRecentLayout) return sessionsSorted.slice(0, 8);
    if (!showSessions) return [];
    const out: SessionListItem[] = [];
    for (const s of sessionsSorted) {
      if (!hasQuery || fuzzyMatch(query, s.title)) {
        out.push(s);
        if (out.length >= sessionLimit) break;
      }
    }
    return out;
  }, [showRecentLayout, sessionsSorted, showSessions, hasQuery, query, sessionLimit]);

  // ── Modes (RightArea modules) ──
  const showModes = category === "modes" || category === "all";
  const modeItems = useMemo(() => {
    if (!showModes) return [] as { id: string; label: string; icon: ReactNode; shortcutId?: string }[];
    return modeRegistry
      .getToolbarModes("workspace")
      .map((m) => ({
        id: m.id,
        label: m.labelKey ? t(m.labelKey) : m.label,
        icon: m.icon,
        shortcutId: MODE_SHORTCUT[m.id],
      }))
      .filter((m) => !query || fuzzyMatch(query, m.label) || fuzzyMatch(query, m.id));
  }, [showModes, query, t]);

  // ── Settings ──
  const showSettings = category === "settings" || category === "all";
  const settingItems = useMemo(() => {
    if (!showSettings)
      return [] as { id: string; label: string; icon: ComponentType<{ className?: string }> }[];
    const all: { id: string; label: string; icon: ComponentType<{ className?: string }> }[] = [];
    for (const g of SETTINGS_GROUPS) {
      for (const it of g.items) {
        const label = t(it.labelKey);
        all.push({ id: it.id, label, icon: it.icon });
      }
    }
    return query ? all.filter((s) => fuzzyMatch(query, s.label) || fuzzyMatch(query, s.id)) : all;
  }, [showSettings, query, t]);

  // ── Literature (FTS over title/abstract/authors/tags/ai_summary via IPC) ──
  const showPapers = category === "literature" || (isAll && hasQuery);
  const [papers, setPapers] = useState<LiteraturePaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  useEffect(() => {
    if (!open || !projectRoot || !showPapers) {
      setPapers([]);
      setPapersLoading(false);
      return;
    }
    // Empty query (only reached in the Literature category) -> list recent papers.
    if (!hasQuery) {
      let cancelled = false;
      setPapersLoading(true);
      window.electronAPI
        .literatureList(projectRoot)
        .then((list) => {
          if (!cancelled) {
            setPapers((list ?? []).slice(0, 20));
            setPapersLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPapers([]);
            setPapersLoading(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }
    if (query.trim().length < 2) {
      setPapers([]);
      setPapersLoading(false);
      return;
    }
    let cancelled = false;
    setPapersLoading(true);
    const timer = setTimeout(() => {
      window.electronAPI
        .literatureSearch(projectRoot, query, 20)
        .then((list) => {
          if (!cancelled) {
            setPapers(list ?? []);
            setPapersLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPapers([]);
            setPapersLoading(false);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, projectRoot, showPapers, hasQuery, query]);

  // ── History (recent queries, per-project localStorage) ──
  const showHistory = category === "history";
  const [history, setHistory] = useState<{ query: string; at: number }[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    if (!open || !showHistory) {
      setHistory([]);
      return;
    }
    setHistory(getSearchHistory(projectRoot));
  }, [open, showHistory, projectRoot, historyVersion]);
  const historyItems = useMemo(() => {
    if (!showHistory) return [] as { query: string; at: number }[];
    if (!hasQuery) return history;
    return history.filter((h) => fuzzyMatch(query, h.query));
  }, [showHistory, history, hasQuery, query]);

  // ── Open actions ──
  const ensureRightAreaOpen = () => {
    const r = rightAreaRef.current;
    if (r?.isCollapsed()) {
      openRightArea({
        centerRef: centerRef.current,
        rightAreaRef: r,
        leftSidebarRef: panelRefs.leftSidebarRef.current,
        isMobile,
      });
    }
  };
  const maximizeRightArea = () => {
    toggleRightAreaMaximize({
      centerRef: centerRef.current,
      rightAreaRef: rightAreaRef.current,
      leftSidebarRef: panelRefs.leftSidebarRef.current,
      isMobile,
    });
  };
  const openFile = (f: ProjectFile, maximize = false) => {
    ensureRightAreaOpen();
    useRightPanelStore.getState().openFile(f.id, f.absolutePath, f.name);
    if (maximize) maximizeRightArea();
  };
  const openSession = (s: SessionListItem, _maximize = false) =>
    useChatStore.getState().loadSession(s.id);
  const openMode = (modeId: string, maximize = false) => {
    const def = modeRegistry.get(modeId);
    if (!def) return;
    ensureRightAreaOpen();
    useLayoutStore.getState().activateMode(modeId as RightToolbarTab);
    const kind = def.tabKinds[0];
    if (kind) useRightPanelStore.getState().ensureTab(kind);
    def.onActivate?.();
    if (maximize) maximizeRightArea();
  };
  const openSetting = (categoryId: string, _maximize = false) => {
    useLayoutStore.getState().setSettingsCategory(categoryId);
    pressLeftNav("settings", { panelRefs: { centerRef, rightAreaRef } });
  };
  const openPaper = async (p: LiteraturePaper, maximize = false) => {
    ensureRightAreaOpen();
    const litStore = useLiteratureStore.getState();
    // Ensure the library store has this paper loaded (it may not if Literature
    // hasn't been opened this session - the open helpers read from the store).
    if (projectRoot && !litStore.papers.some((x) => x.id === p.id)) {
      await litStore.refresh(projectRoot);
    }
    if (paperHasReadablePdf(p)) {
      openPaperPdfReader(p.id, p.title);
    } else {
      openPaperInMainLibrary(p.id);
    }
    if (maximize) maximizeRightArea();
  };

  const createIsland = async (title: string) => {
    if (!projectRoot) return;
    const res = await window.electronAPI.experimentCreate({ projectRoot, title });
    if (!res?.ok) {
      if (res?.hint) toast.error(res.hint);
      return;
    }
    ensureRightAreaOpen();
    useLayoutStore.getState().activateMode("experiments");
    useRightPanelStore.getState().ensureTab("experiments");
    // The create broadcast (focus: true) handles selection; refresh as a fallback.
    const id = res.id;
    void useExperimentStore.getState().selectExperiment(projectRoot, id);
  };

  // "Create new..." + open-URL actions, shown at the bottom when there's a query.
  const isUrlLike =
    /^https?:\/\//i.test(query) ||
    (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(query) && !query.includes(" "));
  const urlToOpen = isUrlLike
    ? query.startsWith("http")
      ? query
      : `https://${query}`
    : null;
  const createOptions = useMemo(() => {
    if (!hasQuery) return [] as { id: string; label: string; icon: ReactNode; run: () => void }[];
    const opts: { id: string; label: string; icon: ReactNode; run: () => void }[] = [];
    if (category === "all" || category === "files") {
      opts.push({
        id: "create-file",
        label: `${t("shell.command.createFile")} · ${query}`,
        icon: <FilePlusIcon className="size-4" />,
        run: () => {
          void useDocumentStore.getState().createNewFile(query);
        },
      });
    }
    if (category === "all" || category === "sessions") {
      opts.push({
        id: "create-session",
        label: `${t("shell.command.createSession")} · ${query}`,
        icon: <MessageSquarePlusIcon className="size-4" />,
        run: () => {
          useChatStore.getState().newSession();
          void useChatStore.getState().sendPrompt(query);
        },
      });
    }
    if (category === "all") {
      opts.push({
        id: "create-island",
        label: `${t("shell.command.createIsland")} · ${query}`,
        icon: <FlaskConicalIcon className="size-4" />,
        run: () => {
          void createIsland(query);
        },
      });
    }
    return opts;
  }, [hasQuery, query, category, t]);

  const now = Date.now();
  const hasResults =
    fileItems.length > 0 ||
    sessionItems.length > 0 ||
    papers.length > 0 ||
    modeItems.length > 0 ||
    settingItems.length > 0 ||
    createOptions.length > 0 ||
    Boolean(urlToOpen) ||
    historyItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[15vh] left-1/2 -translate-x-1/2 translate-y-0 overflow-hidden p-0 shadow-lg sm:max-w-xl"
      >
        <Command
          loop
          filter={passAllFilter}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          <DialogTitle className="sr-only">{t("shell.commandPalette")}</DialogTitle>
          <CommandInput
            placeholder={t("shell.commandPalettePlaceholder")}
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleKeyDown}
          />
          {/* Category tabs - fixed above the scrolling list */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-[length:var(--font-size-11)] transition-colors",
                  category === c.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {t(c.labelKey)}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1 text-[length:var(--font-size-10)] text-muted-foreground/60">
              <kbd className="rounded border px-1">Tab</kbd>
              {t("shell.command.tabHint")}
            </span>
          </div>
          <CommandList className="max-h-[50vh]">
            {query && !hasResults ? (
              <div className="py-6 text-center text-[length:var(--font-menu-item)] text-muted-foreground">
                {t("shell.commandPaletteEmpty")}
              </div>
            ) : null}

            {sessionItems.length > 0 && (
              <CommandGroup heading={t("shell.command.sessions")}>
                {sessionItems.map((s) => (
                  <CommandItem
                    key={`session-${s.id}`}
                    value={`session ${s.id} ${s.title}`}
                    onSelect={() => run(() => openSession(s, consumeMaximize()))}
                  >
                    <MessageSquareIcon className="size-4" />
                    <span className="flex-1 truncate">{s.title}</span>
                    <CommandShortcut className="tabular-nums">
                      {formatRelativeTimeMs(s.lastModified, now)}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {showHistory && historyItems.length > 0 && (
              <CommandGroup
                heading={
                  <span className="flex items-center justify-between pr-2">
                    {t("shell.command.history")}
                    <button
                      type="button"
                      className="text-[length:var(--font-size-11)] text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSearchHistory(projectRoot);
                        setHistoryVersion((v) => v + 1);
                      }}
                    >
                      {t("shell.command.clearHistory")}
                    </button>
                  </span>
                }
              >
                {historyItems.map((h) => (
                  <CommandItem
                    key={`hist-${h.at}-${h.query}`}
                    value={`history ${h.query}`}
                    onSelect={() => {
                      setQuery(h.query);
                    }}
                  >
                    <HistoryIcon className="size-4" />
                    <span className="flex-1 truncate">{h.query}</span>
                    <CommandShortcut className="tabular-nums">
                      {formatRelativeTimeMs(h.at, now)}
                    </CommandShortcut>
                    <button
                      type="button"
                      className="ml-1 shrink-0 text-muted-foreground/50 opacity-0 hover:text-destructive group-data-[selected=true]:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSearchHistory(projectRoot, h.query);
                        setHistoryVersion((v) => v + 1);
                      }}
                      aria-label={t("shell.command.removeHistory")}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {fileItems.length > 0 && (
              <CommandGroup heading={t("shell.command.files")}>
                {fileItems.map((file) => (
                  <CommandItem
                    key={`file-${file.id}`}
                    value={`file ${file.id} ${file.name}`}
                    onSelect={() => run(() => openFile(file, consumeMaximize()))}
                  >
                    {getFileIcon(file)}
                    <span className="flex-1 truncate font-mono text-[length:var(--font-size-11)]">
                      {file.relativePath}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {showPapers && (papers.length > 0 || papersLoading) && (
              <CommandGroup heading={t("shell.command.literature")}>
                {papersLoading ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-[length:var(--font-menu-item)] text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    <span>{t("shell.command.searching")}</span>
                  </div>
                ) : (
                  papers.map((p) => {
                    const hasPdf = paperHasReadablePdf(p);
                    const extracted = p.ai_metadata_status === "ready";
                    return (
                      <CommandItem
                        key={`paper-${p.id}`}
                        value={`paper ${p.id} ${p.title}`}
                        onSelect={() => run(() => openPaper(p, consumeMaximize()))}
                      >
                        {hasPdf ? (
                          <BookOpenIcon className="size-4" />
                        ) : (
                          <BookIcon className="size-4 text-muted-foreground/50" />
                        )}
                        <span className="flex-1 truncate">{p.title}</span>
                        {extracted ? (
                          <SparklesIcon className="ml-auto size-3.5 shrink-0 text-primary/70" />
                        ) : null}
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
            )}

            {modeItems.length > 0 && (
              <CommandGroup heading={t("shell.command.modes")}>
                {modeItems.map((m) => (
                  <CommandItem
                    key={`mode-${m.id}`}
                    value={`mode ${m.id} ${m.label}`}
                    onSelect={() => run(() => openMode(m.id, consumeMaximize()))}
                  >
                    {m.icon}
                    <span className="flex-1 truncate">{m.label}</span>
                    {m.shortcutId ? <ShortcutKbdChips id={m.shortcutId} className="ml-auto" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {settingItems.length > 0 && (
              <CommandGroup heading={t("shell.command.settings")}>
                {settingItems.map((s) => {
                  const Icon = s.icon;
                  return (
                    <CommandItem
                      key={`setting-${s.id}`}
                      value={`setting ${s.label} ${s.id}`}
                      onSelect={() => run(() => openSetting(s.id, consumeMaximize()))}
                    >
                      <Icon className="size-4" />
                      <span className="flex-1 truncate">{s.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {(createOptions.length > 0 || urlToOpen) && (
              <CommandGroup heading={t("shell.command.create")}>
                {urlToOpen ? (
                  <CommandItem
                    key="open-url"
                    value={`url ${urlToOpen}`}
                    onSelect={() =>
                      run(() => {
                        ensureRightAreaOpen();
                        openUrlInBrowser(urlToOpen);
                      })
                    }
                  >
                    <GlobeIcon className="size-4" />
                    <span className="flex-1 truncate">
                      {t("shell.command.openInBrowser")} · {urlToOpen}
                    </span>
                  </CommandItem>
                ) : null}
                {createOptions.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.id} ${query}`}
                    onSelect={() => run(o.run)}
                  >
                    {o.icon}
                    <span className="flex-1 truncate">{o.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[length:var(--font-size-11)] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              {t("shell.command.footer.navigate")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Tab</Kbd>
              {t("shell.command.footer.switch")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              {t("shell.command.footer.open")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>⇧</Kbd>
              <Kbd>↵</Kbd>
              {t("shell.command.footer.maximize")}
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              {t("shell.command.footer.close")}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Single app-level host - open via layout-store / ⌘K / sidebar search button. */
export function AppCommandPalette({
  panelRefs,
  isMobile,
}: {
  panelRefs: CommandPanelRefs;
  isMobile?: boolean;
}) {
  const open = useLayoutStore((s) => s.commandPaletteOpen);
  const setOpen = useLayoutStore((s) => s.setCommandPaletteOpen);
  return <CommandPalette open={open} onOpenChange={setOpen} panelRefs={panelRefs} isMobile={isMobile} />;
}
