import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
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
import { BookIcon, BookOpenIcon, Loader2Icon, FilePlusIcon, MessageSquarePlusIcon, FlaskConicalIcon, GlobeIcon, HistoryIcon, XIcon, CheckIcon, MoreHorizontalIcon, SparklesIcon } from "lucide-react";
import { getFileIcon } from "@/lib/files/file-tree";
import { getRecentOpenedFilesForProject, trackRecentOpenedFile } from "@/lib/files/recent-files";
import { openProjectFileFromChat } from "@/lib/files/open-project-file";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore, type ProjectFile } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useThemeStore } from "@/stores/theme-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { openUrlInBrowser } from "@/lib/browser-link";
import { toast } from "sonner";
import { useLiteratureStore } from "@/stores/literature-store";
import type { LiteraturePaper } from "@/types/electron.d";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { openMode } from "@/lib/workspace/open-right-area-mode";
import { SETTINGS_GROUPS } from "@/components/modules/settings/settings-sidebar";
import { pressLeftNav } from "@/lib/workspace/left-nav";
import { openRightArea, toggleRightAreaMaximize } from "@/lib/workspace/right-area-layout";
import { openPaperPdfReader, openPaperInMainLibrary } from "@/lib/literature/open-paper-in-library";
import { paperHasReadablePdf } from "@/modes/literature-mode/literature-format";
import { LiteratureExtractBadge } from "@/modes/literature-mode/literature-extract-badge";
import { useLiteratureExtractStore, useLiteratureExtractSession } from "@/stores/literature-extract-store";
import {
  APP_LOCALE_PREFERENCES,
  normalizeAppLocalePreference,
  type AppLocalePreference,
} from "../../../../shared/app-locale";
import { fuzzyMatch } from "@/lib/search/fuzzy";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
  clearSearchHistory,
} from "@/lib/search/history";
import { formatRelativeTimeMs } from "@/lib/chat/relative-time";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { cn } from "@/lib/utils";
import { ShortcutKbdChips } from "@/lib/shortcuts";
import { getModeShortcutId } from "@/lib/workspace/mode-shortcuts";
import { Kbd } from "@/components/ui/kbd";
import {
  THEME_PACK_IDS,
  getThemePack,
  type ThemePackId,
} from "@/lib/theme/theme-packs";
import {
  CHAT_HOME_BACKDROP_LABEL_KEYS,
  CHAT_HOME_BACKDROP_STYLE_OPTIONS,
} from "@/lib/chat/home-backdrops/registry";
import type { ChatHomeBackdropSetting } from "@/lib/chat/home-backdrops/types";

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

const FILE_LIMIT_ALL = 8;
const FILE_LIMIT_SINGLE = 30;
const RECENT_FILE_PREVIEW = 5;
const SESSION_LIMIT_ALL = 6;
const SETTINGS_PREVIEW_COUNT = 5;
const BACKDROP_PREVIEW_COUNT = 5;

function previewWithSelected<T extends { id: string; selected: boolean }>(
  items: T[],
  limit: number,
): T[] {
  if (items.length <= limit) return items;
  const head = items.slice(0, limit);
  const selected = items.find((item) => item.selected);
  if (!selected || head.some((item) => item.id === selected.id)) return head;
  return [...head.slice(0, limit - 1), selected];
}

function localeOptionLabel(value: AppLocalePreference, t: (key: string) => string): string {
  switch (value) {
    case "en":
      return t("localeName.en");
    case "zh-CN":
      return t("localeName.zhCN");
    case "zh-HK":
      return t("localeName.zhHK");
  }
}

function PaletteMoreItem({
  id,
  label,
  onGo,
}: {
  id: string;
  label: string;
  onGo: () => void;
}) {
  return (
    <CommandItem
      value={id}
      keywords={[label, "more"]}
      onSelect={onGo}
      className="text-muted-foreground"
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="flex-1 truncate">{label}</span>
    </CommandItem>
  );
}

export function CommandPalette({ open, onOpenChange, panelRefs, isMobile }: CommandPaletteProps) {
  const { t } = useTranslation();
  const { centerRef, rightAreaRef } = panelRefs;
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const files = useDocumentStore((s) => s.files);
  const chatTabs = useChatStore((s) => s.tabs);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [backdropExpanded, setBackdropExpanded] = useState(false);
  const [ignoredPaths, setIgnoredPaths] = useState<Set<string>>(() => new Set());
  const paletteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !projectRoot || files.length === 0) {
      setIgnoredPaths(new Set());
      return;
    }
    let cancelled = false;
    const paths = files.map((f) => f.relativePath);
    window.electronAPI
      .gitCheckIgnore(projectRoot, paths)
      .then((ignored) => {
        if (!cancelled) setIgnoredPaths(new Set(ignored));
      })
      .catch(() => {
        if (!cancelled) setIgnoredPaths(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectRoot, files]);

  const visibleFiles = useMemo(
    () => files.filter((f) => !ignoredPaths.has(f.relativePath)),
    [files, ignoredPaths],
  );

  const openSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of chatTabs) {
      if (tab.sessionId) ids.add(tab.sessionId);
    }
    return ids;
  }, [chatTabs]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCategory("all");
      setBackdropExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => paletteInputRef.current?.focus());
  }, [category, open]);

  const close = () => onOpenChange(false);
  const goToCategory = (next: Category) => setCategory(next);
  /** Category chips sit inside cmdk — pointerdown avoids first-click being eaten by focus trap. */
  const onCategoryPointerDown = (next: Category) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    goToCategory(next);
  };
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
      e.stopPropagation();
      const idx = CATEGORIES.findIndex((c) => c.id === category);
      const next = e.shiftKey
        ? (idx - 1 + CATEGORIES.length) % CATEGORIES.length
        : (idx + 1) % CATEGORIES.length;
      goToCategory(CATEGORIES[next].id);
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
  const [sessionsReady, setSessionsReady] = useState(false);
  useEffect(() => {
    if (!open) {
      setSessions([]);
      setSessionsReady(false);
      return;
    }
    if (!projectRoot) {
      setSessions([]);
      setSessionsReady(true);
      return;
    }
    setSessionsReady(false);
    let cancelled = false;
    window.electronAPI
      .agentListSessions(projectRoot)
      .then((list) => {
        if (!cancelled) {
          setSessions((list ?? []).map((s) => ({
            id: s.conversationId,
            title: s.title,
            lastModified: s.updatedAt,
            createdAt: s.createdAt,
            directory: s.directory,
          })));
        }
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setSessionsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectRoot]);

  const sessionsSorted = useMemo(() => {
    const enriched = sessions.map((s) => {
      const tab = chatTabs.find((t) => t.id === s.id || t.sessionId === s.id);
      if (tab?.userTitleSet && tab.title) {
        return { ...s, title: tab.title };
      }
      if (s.title.startsWith("New Chat") || s.title.startsWith("New session")) {
        if (tab?.title && tab.title !== "New Chat") {
          return { ...s, title: tab.title };
        }
      }
      return s;
    });
    return [...enriched].sort((a, b) => b.lastModified - a.lastModified);
  }, [sessions, chatTabs]);

  // ── Recent files (per-project recent-opened list, still present in the tree) ──
  const recentFileItems = useMemo(() => {
    if (!projectRoot) return [] as ProjectFile[];
    const recent = getRecentOpenedFilesForProject(projectRoot);
    const fileById = new Map(visibleFiles.map((f) => [f.id, f]));
    return recent.filter((r) => fileById.has(r.id)).slice(0, RECENT_FILE_PREVIEW).map((r) => fileById.get(r.id)!);
  }, [projectRoot, visibleFiles]);

  // ── File items to render ──
  const showFiles = category === "files" || (isAll && hasQuery);
  const fileLimit = isAll ? FILE_LIMIT_ALL : FILE_LIMIT_SINGLE;
  const fileItems = useMemo(() => {
    if (showRecentLayout) {
      if (!sessionsReady) return [];
      return recentFileItems;
    }
    if (!showFiles) return [];
    const out: ProjectFile[] = [];
    for (const f of visibleFiles) {
      if (!hasQuery || fuzzyMatch(query, f.name) || fuzzyMatch(query, f.relativePath)) {
        out.push(f);
        if (out.length >= fileLimit) break;
      }
    }
    return out;
  }, [showRecentLayout, recentFileItems, showFiles, visibleFiles, hasQuery, query, fileLimit, sessionsReady]);

  // ── Session items to render ──
  const showSessions = category === "sessions" || (isAll && hasQuery);
  const sessionItems = useMemo(() => {
    if (showRecentLayout) return sessionsSorted.slice(0, SESSION_LIMIT_ALL);
    if (!showSessions) return [];
    if (!hasQuery) return sessionsSorted;
    return sessionsSorted.filter((s) => fuzzyMatch(query, s.title));
  }, [showRecentLayout, sessionsSorted, showSessions, hasQuery, query]);

  const showSessionsMore = showRecentLayout && sessionsSorted.length > SESSION_LIMIT_ALL;
  const showFilesMore =
    showRecentLayout &&
    (visibleFiles.length > RECENT_FILE_PREVIEW || recentFileItems.length > 0);

  // ── Modes (RightArea modules) ──
  const showModes = (category === "modes" || (isAll && showRecentLayout)) && sessionsReady;
  const modeItems = useMemo(() => {
    if (!showModes) return [] as { id: string; label: string; icon: ReactNode; shortcutId?: string }[];
    return modeRegistry
      .getAddMenuModes("workspace")
      .map((m) => ({
        id: m.id,
        label: m.labelKey ? t(m.labelKey) : m.label,
        icon: m.icon,
        shortcutId: getModeShortcutId(m.id),
      }))
      .filter((m) => !query || fuzzyMatch(query, m.label) || fuzzyMatch(query, m.id));
  }, [showModes, query, t]);

  // ── Appearance (theme / backdrop / language) — All tab only ──
  const currentThemePack = useThemeStore((s) => s.config.themePack);
  const currentBackdrop = useSettingsStore((s) => s.settings.chatHomeBackdrop ?? "auto");
  const appLocale = useSettingsStore((s) =>
    normalizeAppLocalePreference(s.settings.appLocale),
  );
  const appearanceLabel = t("settings.nav.appearance");
  const themePackPrefix = t("shell.command.themePackPrefix");
  const backdropPrefix = t("shell.command.backdropPrefix");
  const languageLabel = t("shell.command.language");

  type AppearanceQuickItem = {
    kind: "themePack" | "backdrop";
    id: string;
    label: string;
    searchText: string;
    selected: boolean;
  };

  const showAppearanceSection = isAll && sessionsReady;

  const themePackItems = useMemo(() => {
    if (!showAppearanceSection) return [] as AppearanceQuickItem[];

    const packs: AppearanceQuickItem[] = THEME_PACK_IDS.map((id) => {
      const pack = getThemePack(id);
      const name = t(pack.labelKey);
      return {
        kind: "themePack" as const,
        id,
        label: name,
        searchText: [themePackPrefix, name, id, appearanceLabel, "theme", "pack", "主题", "主題"].join(
          " ",
        ),
        selected: currentThemePack === id,
      };
    });

    if (!hasQuery) return packs;
    return packs.filter(
      (item) =>
        fuzzyMatch(query, item.label) ||
        fuzzyMatch(query, item.searchText) ||
        fuzzyMatch(query, item.id),
    );
  }, [showAppearanceSection, hasQuery, query, t, themePackPrefix, appearanceLabel, currentThemePack]);

  const backdropItems = useMemo(() => {
    if (!showAppearanceSection) return [] as AppearanceQuickItem[];

    const backdrops: AppearanceQuickItem[] = [
      {
        kind: "backdrop" as const,
        id: "auto",
        label: t("settings.appearance.chatHomeBackdropDefault"),
        searchText: [
          backdropPrefix,
          t("settings.appearance.chatHomeBackdropDefault"),
          "auto",
          "default",
          appearanceLabel,
          "backdrop",
          "background",
          "背景",
        ].join(" "),
        selected: currentBackdrop === "auto" || currentBackdrop === "none",
      },
      ...CHAT_HOME_BACKDROP_STYLE_OPTIONS.map((id) => {
        const name = t(CHAT_HOME_BACKDROP_LABEL_KEYS[id]);
        return {
          kind: "backdrop" as const,
          id,
          label: name,
          searchText: [backdropPrefix, name, id, appearanceLabel, "backdrop", "background", "背景"].join(
            " ",
          ),
          selected: currentBackdrop === id,
        };
      }),
    ];

    if (!hasQuery) return backdrops;
    return backdrops.filter(
      (item) =>
        fuzzyMatch(query, item.label) ||
        fuzzyMatch(query, item.searchText) ||
        fuzzyMatch(query, item.id),
    );
  }, [
    showAppearanceSection,
    hasQuery,
    query,
    t,
    backdropPrefix,
    appearanceLabel,
    currentBackdrop,
  ]);

  const visibleBackdropItems = useMemo(() => {
    if (hasQuery || backdropExpanded || !showRecentLayout) return backdropItems;
    return previewWithSelected(backdropItems, BACKDROP_PREVIEW_COUNT);
  }, [backdropItems, hasQuery, backdropExpanded, showRecentLayout]);

  const showBackdropMore =
    showRecentLayout &&
    !backdropExpanded &&
    !hasQuery &&
    backdropItems.length > BACKDROP_PREVIEW_COUNT;

  const languageItems = useMemo(() => {
    if (!showAppearanceSection) return [] as { id: AppLocalePreference; label: string; selected: boolean }[];

    const all = APP_LOCALE_PREFERENCES.map((id) => ({
      id,
      label: localeOptionLabel(id, t),
      selected: appLocale === id,
      searchText: [languageLabel, localeOptionLabel(id, t), id, "language", "locale", "语言", "語言"].join(
        " ",
      ),
    }));

    if (!hasQuery) return all;
    return all.filter(
      (item) =>
        fuzzyMatch(query, item.label) ||
        fuzzyMatch(query, item.searchText) ||
        fuzzyMatch(query, item.id),
    );
  }, [showAppearanceSection, hasQuery, query, t, languageLabel, appLocale]);

  const showAppearanceGroups =
    themePackItems.length > 0 || backdropItems.length > 0 || languageItems.length > 0;

  // ── Settings ──
  const showSettings =
    category === "settings" || (isAll && (showRecentLayout || hasQuery) && sessionsReady);
  const proSettings = useProLicenseStore((s) => s.contributions.settings);

  const allSettingItems = useMemo(() => {
    if (!showSettings)
      return [] as { id: string; label: string; icon: ComponentType<{ className?: string }> }[];
    const all: { id: string; label: string; icon: ComponentType<{ className?: string }> }[] = [];
    for (const g of SETTINGS_GROUPS) {
      for (const it of g.items) {
        const label = t(it.labelKey);
        all.push({ id: it.id, label, icon: it.icon });
      }
    }
    for (const it of proSettings) {
      const label = it.sectionLabelKey
        ? t(it.sectionLabelKey, { defaultValue: it.sectionLabel })
        : it.sectionLabel;
      all.push({ id: it.id, label, icon: SparklesIcon });
    }
    return query
      ? all.filter((s) => fuzzyMatch(query, s.label) || fuzzyMatch(query, s.id))
      : all;
  }, [showSettings, query, t, proSettings]);

  const visibleSettingItems = useMemo(() => {
    if (hasQuery || category === "settings") return allSettingItems;
    if (showRecentLayout) return allSettingItems.slice(0, SETTINGS_PREVIEW_COUNT);
    return [];
  }, [allSettingItems, hasQuery, category, showRecentLayout]);

  const showSettingsMore =
    showRecentLayout && allSettingItems.length > SETTINGS_PREVIEW_COUNT;

  const applyAppearanceQuick = (item: AppearanceQuickItem) => {
    if (item.kind === "themePack") {
      void useThemeStore.getState().updateConfig({ themePack: item.id as ThemePackId });
      return;
    }
    if (item.id === "auto") {
      void useSettingsStore.getState().updateSettings({ chatHomeBackdrop: "auto" });
      return;
    }
    void useSettingsStore.getState().updateSettings({
      chatHomeBackdropEnabled: true,
      chatHomeBackdrop: item.id as ChatHomeBackdropSetting,
    });
  };

  const applyLanguage = (locale: AppLocalePreference) => {
    void useSettingsStore.getState().updateSettings({ appLocale: locale });
  };

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

  const extractStates = useLiteratureExtractStore((s) => s.statesByPaper);
  const paperIdsForExtract = useMemo(() => papers.map((p) => p.id), [papers]);
  useLiteratureExtractSession(open && showPapers ? projectRoot : null, paperIdsForExtract);

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
  const openFile = async (f: ProjectFile, maximize = false) => {
    ensureRightAreaOpen();
    void trackRecentOpenedFile(f.relativePath, f.name);
    const ok = await openProjectFileFromChat(f.relativePath, { pin: false });
    if (!ok) {
      toast.error(t("shell.command.fileOpenFailed", { path: f.relativePath }));
      return;
    }
    if (maximize) maximizeRightArea();
  };
  const openSession = (s: SessionListItem, _maximize = false) =>
    useChatStore.getState().loadSession(s.id);
  const openMode = (modeId: string, maximize = false) => {
    const def = modeRegistry.get(modeId);
    if (!def) return;
    ensureRightAreaOpen();
    openMode(modeId);
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
  const moreLabel = t("shell.command.more");
  const hasResults =
    fileItems.length > 0 ||
    showFilesMore ||
    sessionItems.length > 0 ||
    showSessionsMore ||
    (!sessionsReady && showRecentLayout) ||
    papers.length > 0 ||
    modeItems.length > 0 ||
    visibleSettingItems.length > 0 ||
    showSettingsMore ||
    showAppearanceGroups ||
    showBackdropMore ||
    createOptions.length > 0 ||
    Boolean(urlToOpen) ||
    historyItems.length > 0;

  // Do not remount cmdk when sessions finish loading — that reset selection/focus and
  // broke category clicks, Tab, and ↑↓ until the user interacted again.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/30"
        className="top-[15vh] left-1/2 -translate-x-1/2 translate-y-0 overflow-hidden border-border-subtle bg-background/88 p-0 shadow-lg backdrop-blur-md sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => paletteInputRef.current?.focus());
        }}
      >
        {/* Remount per category so cmdk drops the previous tab's selection.
            Otherwise History has no aria-selected row and Enter is a no-op. */}
        <Command
          key={category}
          loop
          filter={passAllFilter}
          className="bg-transparent text-[length:var(--font-size-13)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-[length:var(--font-size-12)] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-1 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-11 [&_[cmdk-input]]:text-[length:var(--font-size-13)] [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-1.5 [&_[cmdk-item]]:text-[length:var(--font-size-13)] [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          <DialogTitle className="sr-only">{t("shell.commandPalette")}</DialogTitle>
          <CommandInput
            ref={paletteInputRef}
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
                tabIndex={-1}
                onPointerDown={onCategoryPointerDown(c.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-[length:var(--font-size-12)] transition-colors",
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
          {showRecentLayout && !sessionsReady ? (
            <div className="flex items-center gap-2 border-b px-3 py-3 text-[length:var(--font-size-13)] text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              <span>{t("shell.command.searching")}</span>
            </div>
          ) : null}
          <CommandList className="max-h-[50vh]">
            {query && !hasResults ? (
              <div className="py-6 text-center text-[length:var(--font-size-13)] text-muted-foreground">
                {t("shell.commandPaletteEmpty")}
              </div>
            ) : null}

            {sessionItems.length > 0 && (
              <CommandGroup heading={t("shell.command.sessions")}>
                {sessionItems.map((s) => (
                  <CommandItem
                    key={`session-${s.id}`}
                    value={`session ${s.id} ${s.title}`}
                    className="pl-3"
                    onSelect={() => run(() => openSession(s, consumeMaximize()))}
                  >
                    <span className="flex w-3 shrink-0 items-center justify-center">
                      {openSessionIds.has(s.id) ? (
                        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                      ) : null}
                    </span>
                    <span className="flex-1 truncate pl-1">{displayChatTitle(s.title, t)}</span>
                    <CommandShortcut className="tabular-nums">
                      {formatRelativeTimeMs(s.lastModified, now)}
                    </CommandShortcut>
                  </CommandItem>
                ))}
                {showSessionsMore ? (
                  <PaletteMoreItem
                    id="palette-more-sessions"
                    label={moreLabel}
                    onGo={() => goToCategory("sessions")}
                  />
                ) : null}
              </CommandGroup>
            )}

            {showHistory && historyItems.length > 0 && (
              <CommandGroup
                heading={
                  <span className="flex items-center justify-between pr-2">
                    {t("shell.command.history")}
                    <button
                      type="button"
                      tabIndex={-1}
                      className="text-[length:var(--font-size-12)] text-muted-foreground hover:text-destructive"
                      onPointerDown={(e) => {
                        e.preventDefault();
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
                      const replay = h.query;
                      goToCategory("all");
                      setQuery(replay);
                      requestAnimationFrame(() => {
                        setQuery(replay);
                        paletteInputRef.current?.focus();
                      });
                    }}
                  >
                    <HistoryIcon className="size-4" />
                    <span className="flex-1 truncate">{h.query}</span>
                    <CommandShortcut className="tabular-nums">
                      {formatRelativeTimeMs(h.at, now)}
                    </CommandShortcut>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="ml-1 shrink-0 text-muted-foreground/50 opacity-0 hover:text-destructive group-data-[selected=true]:opacity-100"
                      onPointerDown={(e) => {
                        e.preventDefault();
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
                    <span className="flex-1 truncate font-mono text-[length:var(--font-size-12)]">
                      {file.relativePath}
                    </span>
                  </CommandItem>
                ))}
                {showFilesMore ? (
                  <PaletteMoreItem
                    id="palette-more-files"
                    label={moreLabel}
                    onGo={() => goToCategory("files")}
                  />
                ) : null}
              </CommandGroup>
            )}

            {showAppearanceGroups ? (
              <>
                {themePackItems.length > 0 ? (
                  <CommandGroup
                    heading={
                      <span className="flex w-full items-center justify-between gap-2 pr-1">
                        <span>{themePackPrefix}</span>
                        <ShortcutKbdChips id="product.cycleThemePack" />
                      </span>
                    }
                  >
                    {themePackItems.map((item) => (
                      <CommandItem
                        key={`theme-pack-${item.id}`}
                        value={`appearance theme ${item.searchText}`}
                        onSelect={() => run(() => applyAppearanceQuick(item))}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {item.selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {visibleBackdropItems.length > 0 || showBackdropMore ? (
                  <CommandGroup
                    heading={
                      <span className="flex w-full items-center justify-between gap-2 pr-1">
                        <span>{backdropPrefix}</span>
                        <ShortcutKbdChips id="product.cycleChatBackdrop" />
                      </span>
                    }
                  >
                    {visibleBackdropItems.map((item) => (
                      <CommandItem
                        key={`backdrop-${item.id}`}
                        value={`appearance backdrop ${item.searchText}`}
                        onSelect={() => run(() => applyAppearanceQuick(item))}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {item.selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </CommandItem>
                    ))}
                    {showBackdropMore ? (
                      <PaletteMoreItem
                        id="palette-more-backdrops"
                        label={moreLabel}
                        onGo={() => setBackdropExpanded(true)}
                      />
                    ) : null}
                  </CommandGroup>
                ) : null}
                {languageItems.length > 0 ? (
                  <CommandGroup heading={languageLabel}>
                    {languageItems.map((item) => (
                      <CommandItem
                        key={`language-${item.id}`}
                        value={`appearance language ${item.label} ${item.id}`}
                        onSelect={() => run(() => applyLanguage(item.id))}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {item.selected ? <CheckIcon className="size-3.5 text-primary" /> : null}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </>
            ) : null}

            {showPapers && (papers.length > 0 || papersLoading) && (
              <CommandGroup heading={t("shell.command.literature")}>
                {papersLoading ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-[length:var(--font-size-13)] text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    <span>{t("shell.command.searching")}</span>
                  </div>
                ) : (
                  papers.map((p) => {
                    const hasPdf = paperHasReadablePdf(p);
                    return (
                      <CommandItem
                        key={`paper-${p.id}`}
                        value={`paper ${p.id} ${p.title}`}
                        onSelect={() => run(() => openPaper(p, consumeMaximize()))}
                      >
                        <span className="flex w-7 shrink-0 items-center justify-center">
                          <LiteratureExtractBadge
                            paperId={p.id}
                            statesByPaper={extractStates}
                            visible
                          />
                        </span>
                        {hasPdf ? (
                          <BookOpenIcon className="size-4" />
                        ) : (
                          <BookIcon className="size-4 text-muted-foreground/50" />
                        )}
                        <span className="flex-1 truncate">{p.title}</span>
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

            {(visibleSettingItems.length > 0 || showSettingsMore) && (
              <CommandGroup heading={t("shell.command.settings")}>
                {visibleSettingItems.map((s) => {
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
                {showSettingsMore ? (
                  <PaletteMoreItem
                    id="palette-more-settings"
                    label={t("shell.command.settingsMore")}
                    onGo={() => goToCategory("settings")}
                  />
                ) : null}
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[length:var(--font-size-12)] text-muted-foreground">
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
