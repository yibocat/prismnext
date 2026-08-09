export interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

/** Manifest entry — fields mirror electron-builder's latest.yml. */
export interface UpdateVersionInfo {
  version: string;
  path: string;
  releaseNotes?: string;
  pubDate?: string;
}

/**
 * Primary updater status from main (`update:check` / `update:status` / download).
 * Prefer this over the legacy UpdateCheckResult shape.
 */
export type UpdaterStatus = {
  status:
    | "idle"
    | "checking"
    | "up-to-date"
    | "available"
    | "downloading"
    | "downloaded"
    | "error"
    | "no-source"
    | "ignored";
  currentVersion: string;
  latestVersion?: string;
  progress?: { percent: number };
  error?: string;
  releaseNotes?: string;
  /** Compat openExternal fallback — prefer updateDownload when packaged. */
  latest?: UpdateVersionInfo;
};

/** @deprecated Prefer UpdaterStatus — kept for narrow welcome-badge checks. */
export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "available"; currentVersion: string; latest: UpdateVersionInfo }
  | { status: "ignored"; currentVersion: string; latest: UpdateVersionInfo }
  | { status: "error"; currentVersion: string; error: string }
  | { status: "no-source"; currentVersion: string };
/** App + bundled OpenCode agent versions for Settings → About. */
export interface AboutVersions {
  appVersion: string;
  opencode: {
    available: boolean;
    version: string | null;
    path: string;
    error?: string;
  };
}

export interface CompilerStatus {
  texlive: TexliveStatus;
  tectonic: boolean;
}

export type PaperExtractSource = "mineru" | "pdfjs" | "html";
export type PaperExtractStatus = "idle" | "queued" | "extracting" | "ready" | "failed";

export interface PaperExtractState {
  paperId: string;
  source: PaperExtractSource;
  status: PaperExtractStatus;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  mdPath?: string;
  pages?: number;
  remoteJobId?: string;
  retryCount?: number;
  nextRetryAt?: number;
}

export type ExtractProgressPhase =
  | "queued"
  | "resolving_pdf"
  | "caching_pdf"
  | "reading_pdf"
  | "uploading"
  | "cloud_extracting"
  | "fetching_html"
  | "writing";

export interface PaperExtractProgress {
  paperId: string;
  source: PaperExtractSource;
  phase: ExtractProgressPhase;
  message: string;
  percent?: number;
  receivedBytes?: number;
  totalBytes?: number | null;
  queuePosition?: number;
  queueTotal?: number;
}

export type PaperExtractStatesByPaper = Record<
  string,
  Partial<Record<PaperExtractSource, PaperExtractState>>
>;

export interface BibFallbackEntry {
  bibkey: string;
  title: string | null;
  doi: string | null;
  arxivId: string | null;
  canImportFromBib: boolean;
}

export interface CitationHealthLibraryCheck {
  texFilesScanned: number;
  citeKeysInTex: string[];
  knownKeys: string[];
  missingKeys: string[];
  unusedKeys: string[];
}

export interface CitationHealthBibCheck {
  texFilesScanned: number;
  bibPath: string | null;
  citeKeysInTex: string[];
  keysInBib: string[];
  missingKeys: string[];
  unusedKeys: string[];
  duplicateKeys: string[];
  libraryCheck?: CitationHealthLibraryCheck;
}

export interface CitationHealthReport {
  bibCheck: CitationHealthBibCheck;
  libraryCheck: CitationHealthLibraryCheck;
  bibFallback: BibFallbackEntry[];
  bibKeysNotInLibrary: string[];
}

export interface MergeIntoManuscriptBibResult {
  bibPath: string;
  appended: string[];
  skipped: string[];
  notFound: string[];
  papersProcessed: number;
}

export interface ImportFromManuscriptBibResult {
  imported: number;
  skipped: number;
  notInBib: string[];
  importedPaperIds: string[];
}

export interface LiteraturePaper {
  id: string;
  bibkey: string;
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  arxiv_id: string | null;
  isbn: string | null;
  venue: string | null;
  type: string | null;
  pdf_path: string | null;
  pdf_sha: string | null;
  origin: string | null;
  metadata_source: string | null;
  csl_json: string | null;
  /** @deprecated Use `origin` instead */
  source: string | null;
  raw_bibtex: string | null;
  zotero_key?: string | null;
  zotero_version?: number | null;
  zotero_attach_key?: string | null;
  /** User-defined project tags (not synced to Zotero). */
  tags: string[];
  ai_summary?: string | null;
  ai_metadata_at?: number | null;
  ai_metadata_sha?: string | null;
  ai_metadata_status?: "idle" | "queued" | "running" | "ready" | "failed" | "skipped";
  ai_metadata_error?: string | null;
  created_at: number;
  updated_at: number;
}

export type PaperCitationEntry = {
  openAlexId: string;
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  citedByCount: number | null;
};

export type PaperCitationSection = {
  totalCount: number;
  items: PaperCitationEntry[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type PaperCitationNetworkResult = {
  ok: boolean;
  error?: string;
  openAlexWorkId?: string;
  references?: PaperCitationSection;
  citedBy?: PaperCitationSection;
  cachedAt?: number;
  source: "openalex" | "semantic-scholar";
  sourceNote?: string;
};

export type LiteratureAttachLocalPdfConflict =
  | { kind: "sha_duplicate"; otherPaper: LiteraturePaper }
  | {
      kind: "identifier_duplicate";
      otherPaper: LiteraturePaper;
      doi?: string | null;
      arxivId?: string | null;
    }
  | {
      kind: "target_mismatch";
      entryDoi?: string | null;
      entryArxivId?: string | null;
      pdfDoi?: string | null;
      pdfArxivId?: string | null;
    }
  | {
      kind: "target_unverified";
      entryDoi?: string | null;
      entryArxivId?: string | null;
    };

export interface LiteratureAttachLocalPdfResult {
  paper: LiteraturePaper;
  attached: boolean;
  replaced: boolean;
  conflict?: LiteratureAttachLocalPdfConflict;
  attachError?: string;
}

export interface LiteratureCollection {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  paper_count?: number;
  zotero_key?: string | null;
  zotero_parent?: string | null;
  zotero_version?: number | null;
}

export type LiteratureLibraryView =
  | { kind: "all" }
  | { kind: "reading-list" }
  | { kind: "collection"; collectionId: string };

export interface LiteratureAnnotation {
  id: string;
  paper_id: string;
  kind: string;
  page: number;
  rects: string;
  quoted_text: string | null;
  color: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export type ZoteroConnectionMode = "local" | "web" | "offline";

export interface ZoteroStatus {
  mode: ZoteroConnectionMode;
  localReachable: boolean;
  bbtInstalled: boolean;
  bbtDebugBridge: boolean;
  webReachable: boolean;
  userId?: string;
  error?: string;
}

export interface ZoteroCollection {
  key: string;
  name: string;
  parentKey: string | null;
  version: number;
}

export interface ZoteroProjectBinding {
  zoteroCollectionId?: string;
  zoteroCollectionName?: string;
}

export interface ZoteroSyncResult {
  collectionsUpserted: number;
  papersUpserted: number;
  collectionKey: string;
  collectionsPruned: number;
  papersPruned: number;
}

export interface LiteratureStorageStats {
  attachmentCount: number;
  attachmentBytes: number;
  referencedCount: number;
  orphanCount: number;
  orphanBytes: number;
  legacyPdfCacheBytes: number;
}

export interface PruneOrphanAttachmentsResult {
  deletedFiles: number;
  freedBytes: number;
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  createdAt: number;
  order: number;
}

export interface BrowserRecentVisit {
  url: string;
  title: string;
  visitedAt: number;
}

export interface BrowserStateData {
  bookmarks: BrowserBookmark[];
  recent: BrowserRecentVisit[];
  maxRecentItems: number;
}

export interface TerminalQuickCommand {
  id: string;
  label: string;
  command: string;
  description?: string;
  order: number;
  createdAt: number;
}

export interface TerminalConfig {
  quickCommands: TerminalQuickCommand[];
}

export interface TerminalEnvInfo {
  shell: string;
  cwd: string;
  platform: string;
  nodeVersion: string;
  home: string;
}

// ── Git types ──

export interface GitFileStatusData {
  path: string;
  oldPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatusData {
  branch: string;
  files: GitFileStatusData[];
}

export interface GitBranchesData {
  current: string;
  branches: string[];
}

export interface GitFileDiffData {
  path: string;
  oldContent: string;
  newContent: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitResultData {
  success: boolean;
  error?: string;
}

export interface GitMergeResultData {
  success: boolean;
  error?: string;
  output?: string;
}

// ── Worktree types ──

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  baseBranch: string;
  head: string;
  aheadCount: number;
  behindCount: number;
}

export interface MergeStatus {
  branch: string;
  mainBranch: string;
  aheadCount: number;
  behindCount: number;
  commits: { hash: string; message: string }[];
}

export interface BranchInfo {
  name: string;
  isLocked: boolean;
  lockedBy: string | null;
}


export interface ElectronAPI {
  // Filesystem operations
  fsScan: (rootPath: string) => Promise<{
    files: Array<{
      relativePath: string;
      absolutePath: string;
      type: "tex" | "image" | "pdf" | "bib" | "style" | "other";
      fileSize: number;
    }>;
    folders: string[];
  }>;
  fsScanMetadata: (rootPath: string) => Promise<{
    files: Array<{
      relativePath: string;
      absolutePath: string;
      type: "tex" | "image" | "pdf" | "bib" | "style" | "other";
      fileSize: number;
    }>;
    folders: string[];
  }>;
  fsRead: (absPath: string) => Promise<{ content: string; missing?: boolean }>;
  fsReadBatch: (absPaths: string[]) => Promise<{ results: Record<string, string> }>;
  fsReadImage: (absPath: string) => Promise<{ dataUrl: string | null; mtimeMs?: number | null }>;
  /** Binary file bytes (PDF preview). Prefer over data-URL for local PDFs. */
  fsReadBytes: (absPath: string) => Promise<{ bytes: ArrayBuffer }>;
  fsWrite: (absPath: string, content: string) => Promise<void>;
  fsCreate: (
    rootPath: string,
    relativePath: string,
    content: string,
  ) => Promise<{ absPath: string }>;
  fsDelete: (absPath: string) => Promise<void>;
  fsDeleteFolder: (absPath: string) => Promise<void>;
  fsRename: (oldPath: string, newPath: string) => Promise<void>;
  fsMkdir: (absPath: string) => Promise<void>;

  // Template operations
  templateList: () => Promise<
    { id: string; name: string; description: string; category: string; tags: string[]; documentClass: string; icon: string }[]
  >;
  templateGet: (templateId: string) => Promise<{
    id: string; name: string; description: string; category: string; tags: string[]; documentClass: string; icon: string;
    files: { path: string; content: string }[];
  } | null>;
  templatePreview: (templateId: string) => Promise<string | null>;
  templateApply: (args: {
    rootPath: string;
    manuscriptDir: string;
    files: { path: string; content: string }[];
    templateId: string;
    templateCategory: string;
  }) => Promise<{ appliedFiles: Record<string, string> }>;
  templateGetPdfData: (templateId: string) => Promise<string | null>;
  templateDetectChanges: (args: {
    rootPath: string;
    manuscriptDir: string;
    appliedFiles: Record<string, string>;
  }) => Promise<{ changed: string[]; deleted: string[]; unchanged: string[] }>;
  templateBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    files: string[];
    backupLabel: string;
    sourceTemplateId?: string;
    targetTemplateId?: string;
  }) => Promise<{ backupPath: string }>;
  templateListBackups: (args: { rootPath: string }) => Promise<
    { label: string; timestamp: string; files: string[] }[]
  >;
  templateRestoreBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    backupLabel: string;
  }) => Promise<{ restored: string[] }>;
  templateDeleteBackup: (args: {
    rootPath: string;
    backupLabel: string;
  }) => Promise<{ deleted: boolean }>;

  // File watcher operations
  fsWatchStart: (rootPath: string) => Promise<void>;
  fsWatchStop: () => Promise<void>;

  // Dialog operations
  dialogOpenFolder: () => Promise<{
    canceled: boolean;
    path: string | null;
  }>;
  dialogOpenFile: () => Promise<{
    canceled: boolean;
    paths: string[];
  }>;
  dialogOpenJsonFile: () => Promise<{
    canceled: boolean;
    path: string | null;
  }>;
  dialogSaveJsonFile: (defaultPath?: string) => Promise<{
    canceled: boolean;
    path: string | null;
  }>;
  shellShowItemInFolder: (absPath: string) => Promise<void>;
  shellOpenExternal: (url: string) => Promise<void>;
  shellDesktopNotify: (args: {
    kind: "turn_complete" | "action_required";
    title: string;
    body: string;
    tabId?: string;
  }) => Promise<boolean>;
  shellSetTrayStatus: (
    status: "idle" | "busy" | "attention",
    tooltip?: string | null,
  ) => Promise<void>;
  shellSetTrayMenu: (snapshot: {
    showLabel: string;
    newChatLabel: string;
    quitLabel: string;
    recent: Array<{
      id: string;
      title: string;
      sessionId?: string;
      tabId?: string;
    }>;
    projectName?: string | null;
    modes?: Array<{
      id: "texworkspace" | "literature" | "experiments";
      label: string;
    }>;
  }) => Promise<void>;
  onShellFocusChatTab: (callback: (args: { tabId: string }) => void) => () => void;
  onShellTrayNewChat: (callback: () => void) => () => void;
  onShellTrayOpenRecent: (
    callback: (args: { id: string; sessionId?: string; tabId?: string }) => void,
  ) => () => void;
  onShellTrayOpenMode: (
    callback: (args: {
      modeId: "texworkspace" | "literature" | "experiments";
    }) => void,
  ) => () => void;
  /** Absolute path for a File from an OS drag-drop (Electron webUtils). */
  getPathForFile: (file: File) => string;
  fsExists: (absPath: string) => Promise<boolean>;
  fsIsFile: (absPath: string) => Promise<boolean>;
  fsStat: (
    absPath: string,
  ) => Promise<{ mtimeMs: number; size: number; isFile: boolean; isDirectory: boolean } | null>;
  /** Bounded project walk: newest-mtime project-relative path whose basename matches. */
  fsFindByBasename: (projectRoot: string, basename: string) => Promise<string | null>;
  projectCreate: (
    rootPath: string,
    workspaceDirs?: import("./workspace").WorkspaceFolder[],
    options?: { initGit?: boolean; projectIcon?: string },
  ) => Promise<void>;
  /** Check feed / manifest and return full updater status. */
  updateCheck: () => Promise<UpdaterStatus>;
  /** Last known status without re-hitting the network. */
  updateStatus: () => Promise<UpdaterStatus>;
  /** Download the pending update (packaged builds). */
  updateDownload: () => Promise<UpdaterStatus>;
  /** Quit and install a downloaded update. */
  updateInstall: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Suppress a version from surfacing as an update. */
  updateIgnore: (version: string) => Promise<UpdaterStatus>;
  /** Clear the ignored-version flag. */
  updateUnignore: () => Promise<UpdaterStatus>;
  /** Download progress from main (`update:progress`). */
  onUpdateProgress: (callback: (data: { percent: number }) => void) => () => void;
  /** Full updater status pushes from main (`update:changed`). */
  onUpdateChanged: (callback: (status: UpdaterStatus) => void) => () => void;
  /** prismnext app version + bundled OpenCode agent binary version. */
  aboutGetVersions: () => Promise<AboutVersions>;
  /** Open-core Pro license (activation key). Null when Free / inactive. */
  proGetLicense: () => Promise<import("../../shared/pro").LicenseSnapshot | null>;
  proActivate: (
    rawKey: string,
  ) => Promise<import("../../shared/pro").ActivateLicenseResult>;
  proClearLicense: () => Promise<{ ok: true }>;
  projectEnsure: (rootPath: string) => Promise<{ success: boolean }>;
  projectScaffoldAgentsMd: (rootPath: string) => Promise<{
    agentsMdPath: string;
    content: string;
    digestMarkdown: string;
    updated: boolean;
    stats: { dirsListed: number; filesListed: number };
  }>;
  projectCheck: (rootPath: string) => Promise<{ missing: string[] }>;

  researchBriefEnsure: (projectRoot: string) => Promise<{ success: boolean; created: boolean; path: string }>;
  researchBriefRead: (projectRoot: string) => Promise<{
    path: string;
    exists: boolean;
    raw: string;
    sections: Record<string, string>;
    sectionNames: readonly string[];
    lastModified: string | null;
  }>;
  researchBriefGetPath: (projectRoot: string) => Promise<{ relativePath: string; absolutePath: string }>;
  researchBriefUpdateSection: (args: {
    projectRoot: string;
    section: string;
    content: string;
    append?: boolean;
  }) => Promise<{ path: string; section: string; append: boolean; ok: boolean; error?: string; lastModified: string | null }>;

  researchPlanWrite: (args: {
    projectRoot: string;
    doc: import("../../shared/research-plan").ResearchPlanDoc;
  }) => Promise<
    | { ok: true; relativePath: string; absolutePath: string }
    | { ok: false; error: string }
  >;

  researchPlanReadDraft: (args: {
    projectRoot: string;
    sessionId?: string;
  }) => Promise<
    | {
        ok: true;
        exists: boolean;
        empty: boolean;
        relativePath: string;
        absolutePath: string;
        markdown: string;
        title?: string;
        description?: string;
        sessionId?: string;
      }
    | { ok: false; error: string }
  >;
  researchPlanClaimDraft: (args: {
    projectRoot: string;
    sessionId: string;
  }) => Promise<
    | {
        ok: true;
        owned: boolean;
        claimed: boolean;
        ownedByOther: boolean;
        sessionId?: string;
        title?: string;
        description?: string;
        relativePath?: string;
      }
    | { ok: false; error: string }
  >;
  researchPlanHasPendingDraft: (args: {
    projectRoot: string;
    sessionId: string;
  }) => Promise<{ ok: true; pending: boolean } | { ok: false; error: string }>;

  researchPlanPromoteDraft: (args: {
    projectRoot: string;
    sessionId?: string;
    /** @deprecated Ignored — promote always renames draft to approved. */
    status?: "approved" | "snapshot";
  }) => Promise<
    | {
        ok: true;
        relativePath: string;
        absolutePath: string;
        title?: string;
        markdown: string;
      }
    | { ok: false; error: string }
  >;
  researchPlanDiscardDraft: (args: {
    projectRoot: string;
    sessionId?: string;
  }) => Promise<{ ok: true; discarded: boolean } | { ok: false; error: string }>;

  // Experiments (Sprint 0.7 — Experiments RightArea mode)
  experimentList: (
    projectRoot: string,
    includeArchived?: boolean,
  ) => Promise<
    | {
        ok: true;
        experimentRoot: string;
        registryRoot: string;
        experiments: import("../../shared/experiment-log").ExperimentSummary[];
        /** Registry dirs with missing/corrupt meta.json (Bug #19). */
        corruptIds?: string[];
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentRead: (args: { projectRoot: string; id: string; runsLimit?: number }) => Promise<
    | {
        ok: true;
        meta: import("../../shared/experiment-log").ExperimentMeta;
        runs: import("../../shared/experiment-log").ExperimentRunEntry[];
        /** Total runs in jsonl (may exceed `runs.length` when limited). */
        runCount: number;
        lastRunAt: string | null;
        experimentRoot: string;
        registryRoot: string;
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentArchive: (args: { projectRoot: string; id: string }) => Promise<
    | { ok: true; meta: import("../../shared/experiment-log").ExperimentMeta }
    | { ok: false; error: string; hint?: string }
  >;
  experimentCreate: (args: {
    projectRoot: string;
    title: string;
    tags?: string[];
    description?: string;
    briefLinks?: {
      sections?: string[];
      hypothesisExcerpt?: string;
      researchQuestionExcerpt?: string;
    };
  }) => Promise<
    | {
        ok: true;
        id: string;
        path: string;
        meta: import("../../shared/experiment-log").ExperimentMeta;
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentUpdate: (args: {
    projectRoot: string;
    id: string;
    title?: string;
    tags?: string[];
    description?: string;
    briefLinks?: {
      sections?: string[];
      hypothesisExcerpt?: string;
      researchQuestionExcerpt?: string;
    } | null;
  }) => Promise<
    | { ok: true; meta: import("../../shared/experiment-log").ExperimentMeta }
    | { ok: false; error: string; hint?: string }
  >;
  experimentUpdateRun: (args: {
    projectRoot: string;
    id: string;
    runId: string;
    notes: string;
  }) => Promise<
    | { ok: true; run: import("../../shared/experiment-log").ExperimentRunEntry }
    | { ok: false; error: string; hint?: string }
  >;
  experimentRestore: (args: { projectRoot: string; id: string }) => Promise<
    | { ok: true; meta: import("../../shared/experiment-log").ExperimentMeta }
    | { ok: false; error: string; hint?: string }
  >;
  experimentDelete: (args: {
    projectRoot: string;
    id: string;
    removeLab?: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: string; hint?: string }>;
  experimentDetectEnv: (args: { projectRoot: string; id: string }) => Promise<
    | {
        ok: true;
        env: import("../../shared/experiment-log").ExperimentEnv;
        workspacePath: string;
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentGetPaths: (args: { projectRoot: string; id: string }) => Promise<
    | { ok: true; registryPath: string; workspaceAbs: string; workspaceRel: string }
    | { ok: false; error: string; hint?: string }
  >;
  experimentRun: (args: {
    projectRoot: string;
    id: string;
    command: string;
    artifacts?: string[];
    notes?: string;
    /** Optional run classification (train/eval/…). Omit when unknown. */
    kind?: import("../../shared/experiment-log").ExperimentRunKind;
    chatSessionId?: string | null;
  }) => Promise<
    | { ok: true; runId: string; status: "started" }
    | { ok: false; error: string; hint?: string }
  >;
  experimentCancelRun: (args: { projectRoot: string; id: string; runId: string }) => Promise<{ ok: true }>;
  experimentSnapshot: (args: {
    projectRoot: string;
    id: string;
    scanDirs?: string[];
    metricsFiles?: string[];
    maxFiles?: number;
    maxDepth?: number;
  }) => Promise<
    | {
        ok: true;
        snapshot: import("../../main/services/experiment-results-snapshot").ExperimentResultsSnapshot;
      }
    | { ok: false; error: string; hint?: string }
  >;
  interactionGet: (
    projectRoot: string,
    id: string,
  ) => Promise<{ spec: import("../../shared/interaction-spec").InteractionSpec | null; error?: string }>;
  interactionList: (projectRoot: string) => Promise<{ ids: string[] }>;
  interactionWrite: (args: {
    projectRoot: string;
    spec: import("../../shared/interaction-spec").InteractionSpec;
  }) => Promise<{ ok: boolean; error?: string }>;
  onInteractionChanged: (
    callback: (data: {
      projectRoot: string;
      id: string;
      title?: string;
      reason: string;
      focus?: boolean;
    }) => void,
  ) => () => void;
  /** Registry changed (create/run/append) or Agent requested UI focus. */
  onExperimentChanged: (
    callback: (data: {
      projectRoot: string;
      id?: string;
      reason: string;
      focus?: boolean;
    }) => void,
  ) => () => void;
  onExperimentRunComplete: (
    callback: (data: import("../../shared/experiment-log").ExperimentRunCompleteEvent) => void,
  ) => () => void;
  onExperimentRunStarted: (
    callback: (data: import("../../shared/experiment-log").ExperimentRunStartedEvent) => void,
  ) => () => void;
  onExperimentRunOutput: (
    callback: (data: import("../../shared/experiment-log").ExperimentRunOutputEvent) => void,
  ) => () => void;

  // Provenance - trace a claimed artifact / run back to its generating command.
  provenanceGetForArtifact: (
    projectRoot: string,
    artifactPath: string,
  ) => Promise<
    | {
        run: import("../../shared/provenance").ProvenanceRunRecorded;
        linkMethod: import("../../shared/provenance").ProvenanceLinkMethod;
      }
    | null
  >;
  provenanceGetForRun: (
    projectRoot: string,
    runId: string,
  ) => Promise<import("../../shared/provenance").ProvenanceRunRecorded | null>;

  // Platform
  platform: "darwin" | "win32" | "linux";

  // Window operations
  windowSetTitle: (title: string) => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  windowIsFullscreen: () => Promise<boolean>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowNew: () => Promise<{ ok: true; id: number }>;

  // Window state events
  onWindowStateChange: (
    callback: (state: {
      isMaximized: boolean;
      isFullscreen: boolean;
    }) => void,
  ) => () => void;

  onCloseTabRequest: (callback: () => void) => () => void;

  // Compile operations
  compileExecute: (
    projectDir: string,
    mainFile: string,
    useTexlive?: boolean,
    opts?: {
      dirtyRelPaths?: string[];
      dirtyFiles?: Array<{ relPath: string; content: string }>;
      pdfOnDisk?: boolean;
      skipSynctex?: boolean;
      fast?: boolean;
    },
  ) => Promise<
    | { pdfBytes?: ArrayBuffer; pdfPath?: string; buildDir?: string; stdout?: string }
    | { error: string; stdout?: string }
  >;
  compileDetectTexlive: () => Promise<CompilerStatus>;
  compileExportPdf: (
    projectRoot: string,
    mainFile: string,
    pdfBytes?: Uint8Array | null,
  ) => Promise<
    | { canceled: true }
    | { canceled: false; ok: true; path: string }
    | { canceled: false; ok: false; error: string }
  >;
  manuscriptPackZip: (
    projectRoot: string,
    manuscriptDir: string,
  ) => Promise<
    | { canceled: true }
    | { canceled: false; ok: true; path: string }
    | { canceled: false; ok: false; error: string }
  >;
  onCompileAgentComplete: (
    callback: (data: {
      projectDir: string;
      success: boolean;
      mainFile?: string;
      pdfBytes?: ArrayBuffer;
      error?: string;
      logTail?: string;
    }) => void,
  ) => () => void;

  // Literature library
  literatureList: (projectRoot: string) => Promise<LiteraturePaper[]>;
  literatureGetPdfCacheStatus: (
    projectRoot: string,
  ) => Promise<Record<string, { cached: boolean; stale: boolean }>>;
  literatureGetStorageStats: (projectRoot: string) => Promise<LiteratureStorageStats>;
  literaturePruneOrphanAttachments: (projectRoot: string) => Promise<PruneOrphanAttachmentsResult>;
  literatureSearch: (projectRoot: string, query: string, limit?: number) => Promise<LiteraturePaper[]>;
  literatureGet: (projectRoot: string, paperId: string) => Promise<LiteraturePaper | null>;
  literatureIngestPdf: (
    projectRoot: string,
    pdfPath: string,
    opts?: { title?: string; doi?: string },
  ) => Promise<{
    paper: LiteraturePaper;
    created: boolean;
    duplicateReason?: "pdf" | "doi" | "arxiv";
    identifiersFound?: boolean;
    identifiers?: { doi?: string | null; arxivId?: string | null };
    enriched?: boolean;
    enrichError?: string;
    pdfAttached?: boolean;
    pdfAttachError?: string;
  }>;
  literatureReplacePdf: (
    projectRoot: string,
    paperId: string,
    pdfPath: string,
  ) => Promise<{ paper: LiteraturePaper; replaced: boolean }>;
  literatureAttachLocalPdf: (
    projectRoot: string,
    paperId: string,
    pdfPath: string,
    opts?: { ignoreIdentifierConflict?: boolean },
  ) => Promise<LiteratureAttachLocalPdfResult>;
  literatureCreateFromIdentifier: (
    projectRoot: string,
    ids: {
      doi?: string;
      arxivId?: string;
      isbn?: string;
      pmid?: string;
      adsBibcode?: string;
    },
  ) => Promise<{
    paper: LiteraturePaper;
    created: boolean;
    duplicateReason?: "doi" | "arxiv";
    pdfAttached?: boolean;
    pdfAttachError?: string;
  }>;
  literatureCreateFromStagedCitation: (
    projectRoot: string,
    citation: import("../../shared/citation-staging").StagedCitationImportInput,
  ) => Promise<
    | import("../../shared/citation-staging").StagedCitationCreateCancelledResult
    | {
        paper: LiteraturePaper;
        created: boolean;
        duplicateReason?: "doi" | "arxiv";
        pdfAttached?: boolean;
        pdfAttachError?: string;
      }
  >;
  literatureCancelStagedCitationAdd: (stagedId: string) => Promise<void>;
  onLiteratureStagedAddProgress: (
    callback: (data: import("../../shared/citation-staging").StagedAddProgressEvent) => void,
  ) => () => void;
  literatureFindExisting: (
    projectRoot: string,
    ids: { doi?: string | null; arxivId?: string | null },
  ) => Promise<{ paperId: string; bibkey: string } | null>;
  literatureStage: (
    projectRoot: string,
    args: {
      sessionId: string;
      doi?: string;
      arxivId?: string;
      sourceUrl?: string;
      discoveredFrom?: "literature-discover" | "paper-search-mcp" | "websearch" | "webfetch" | "user" | "agent";
    },
  ) => Promise<{
    staged: boolean;
    verified: boolean;
    refId?: number;
    citation?: {
      title: string;
      authors: string | null;
      year: number | null;
      venue: string | null;
      type: string | null;
      doi: string | null;
      arxivId: string | null;
      abstract: string | null;
      cslJson: Record<string, unknown> | null;
      sourceUrl: string | null;
      catalogSource: string | null;
      catalogVerified: boolean;
      verifyError: string | null;
      discoveredFrom: "literature-discover" | "paper-search-mcp" | "websearch" | "webfetch" | "user" | "agent";
      libraryPaperId: string | null;
      libraryBibkey: string | null;
    };
    alreadyInLibrary?: boolean;
    libraryBibkey?: string | null;
    error?: string;
    hint?: string;
  }>;
  literatureApplyMetadata: (projectRoot: string, paperId: string, metadata: Partial<LiteraturePaper>) => Promise<LiteraturePaper>;
  literatureApplyIdentifiers: (
    projectRoot: string,
    paperId: string,
    ids: { doi?: string | null; arxivId?: string | null },
  ) => Promise<{ applied: boolean; paper?: LiteraturePaper; duplicatePaper?: LiteraturePaper }>;
  literatureFetchAndApplyMetadata: (
    projectRoot: string,
    paperId: string,
    opts?: { doi?: string; arxivId?: string },
  ) => Promise<{
    paper: LiteraturePaper;
    enriched: boolean;
    enrichError?: string;
    pdfAttached?: boolean;
    pdfAttachError?: string;
  }>;
  literatureDownloadPdf: (
    projectRoot: string,
    paperId: string,
  ) => Promise<{
    paper: LiteraturePaper;
    attached: boolean;
    attachError?: string;
  }>;
  literatureImportBibTeX: (projectRoot: string, bibContent: string, jsonContent?: string) => Promise<{
    imported: number;
    skipped: number;
    importedPaperIds?: string[];
    pdfsAttached?: number;
  }>;
  literatureGetAnnotations: (projectRoot: string, paperId: string) => Promise<LiteratureAnnotation[]>;
  literatureSaveAnnotation: (projectRoot: string, annotation: Omit<LiteratureAnnotation, "created_at" | "updated_at"> & Partial<Pick<LiteratureAnnotation, "created_at" | "updated_at">>) => Promise<LiteratureAnnotation>;
  literatureDeleteAnnotation: (projectRoot: string, annotationId: string) => Promise<{ ok: boolean }>;
  literatureReadPdfBytes: (projectRoot: string, paperId: string) => Promise<{ pdfBytes: Uint8Array | null }>;
  literatureEnsurePaperPdf: (
    projectRoot: string,
    paperId: string,
  ) => Promise<{ pdfUrl: string | null }>;
  onLiteraturePdfDownloadProgress: (
    callback: (data: {
      paperId: string;
      phase: "resolving" | "downloading" | "caching" | "reading" | "opening" | "done";
      receivedBytes?: number;
      totalBytes?: number | null;
    }) => void,
  ) => () => void;
  literatureCreatePaper: (projectRoot: string, metadata: Partial<LiteraturePaper>) => Promise<{
    paper: LiteraturePaper;
    created: boolean;
    duplicateReason?: "doi" | "arxiv";
  }>;
  literatureUpdatePaper: (projectRoot: string, paperId: string, patch: Partial<LiteraturePaper>) => Promise<LiteraturePaper>;
  literatureRegenerateAiMetadata: (projectRoot: string, paperId: string) => Promise<{ ok: boolean }>;
  literatureGetCitationNetwork: (
    projectRoot: string,
    paperId: string,
    opts?: { refresh?: boolean },
  ) => Promise<PaperCitationNetworkResult>;
  literatureGetCitationNetworkPage: (
    projectRoot: string,
    paperId: string,
    section: "references" | "citedBy",
    cursor: string,
    opts?: { refresh?: boolean },
  ) => Promise<PaperCitationNetworkResult>;
  onLiteratureAiMetadataChanged: (
    callback: (payload: { projectRoot: string; paperId: string }) => void,
  ) => () => void;
  literatureDeletePaper: (projectRoot: string, paperId: string) => Promise<{ ok: boolean }>;
  literatureImportToLocal: (projectRoot: string, paperId: string) => Promise<{ ok: boolean }>;
  literatureExportBib: (projectRoot: string, paperIds?: string[]) => Promise<{ content: string }>;
  literatureFormatBibliography: (projectRoot: string, paperIds: string[], style?: string) => Promise<{ content: string }>;
  literatureExportBibToFile: (
    projectRoot: string,
    paperIds?: string[],
    defaultPath?: string,
  ) => Promise<{ canceled: boolean; path: string | null }>;
  literatureCite: (projectRoot: string, bibkey: string) => Promise<{ bibPath: string; appended: boolean }>;
  literatureCitationHealth: (projectRoot: string) => Promise<CitationHealthReport>;
  literatureMergeIntoProjectBib: (
    projectRoot: string,
    options?: { bibkeys?: string[]; all?: boolean; onlyCitedInTex?: boolean },
  ) => Promise<MergeIntoManuscriptBibResult>;
  literatureImportFromProjectBib: (
    projectRoot: string,
    bibkeys?: string[],
  ) => Promise<ImportFromManuscriptBibResult>;
  literatureReadingList: (projectRoot: string) => Promise<LiteraturePaper[]>;
  literatureListCollections: (projectRoot: string) => Promise<LiteratureCollection[]>;
  literatureCreateCollection: (
    projectRoot: string,
    name: string,
    parentId?: string | null,
  ) => Promise<LiteratureCollection>;
  literatureUpdateCollection: (
    projectRoot: string,
    collectionId: string,
    name: string,
  ) => Promise<LiteratureCollection>;
  literatureDeleteCollection: (projectRoot: string, collectionId: string) => Promise<{ ok: boolean }>;
  literatureListCollectionPaperIds: (projectRoot: string, collectionId: string) => Promise<string[]>;
  literatureAddPapersToCollection: (
    projectRoot: string,
    collectionId: string,
    paperIds: string[],
  ) => Promise<{ added: number; skipped: number }>;
  literatureRemovePapersFromCollection: (
    projectRoot: string,
    collectionId: string,
    paperIds: string[],
  ) => Promise<{ removed: number }>;
  literatureImportFromProject: (targetRoot: string, sourceRoot: string, paperIds: string[], opts?: { includeAnnotations?: boolean; includePdf?: boolean }) => Promise<{ imported: number; skipped: number }>;
  literaturePickPdf: () => Promise<{ path: string | null }>;
  literaturePickBibTeX: () => Promise<{ paths: string[] }>;
  literaturePickProjectRoot: () => Promise<{ path: string | null; error?: string }>;

  extractEnqueue: (
    projectRoot: string,
    paperId: string,
    source: "mineru" | "pdfjs" | "html",
    force?: boolean,
  ) => Promise<{ ok: boolean }>;
  extractRetry: (
    projectRoot: string,
    paperId: string,
    source: "mineru" | "pdfjs" | "html",
  ) => Promise<{ ok: boolean }>;
  extractEnqueueBatch: (
    projectRoot: string,
    paperIds: string[],
    source: "mineru" | "pdfjs" | "html",
    force?: boolean,
  ) => Promise<{ enqueued: number; skipped: number; capped: boolean }>;
  extractEnqueueCollection: (
    projectRoot: string,
    collectionId: string,
    source: "mineru" | "pdfjs" | "html",
    force?: boolean,
  ) => Promise<{ enqueued: number; skipped: number; capped: boolean }>;
  extractCancel: (
    projectRoot: string,
    paperId: string,
    source: "mineru" | "pdfjs" | "html",
  ) => Promise<{ ok: boolean }>;
  extractList: (
    projectRoot: string,
    paperIds: string[],
  ) => Promise<PaperExtractStatesByPaper>;
  extractGet: (
    projectRoot: string,
    paperId: string,
    source: "mineru" | "pdfjs" | "html",
  ) => Promise<{ state: PaperExtractState | null; markdown: string | null }>;
  extractGetBlocks: (
    projectRoot: string,
    paperId: string,
    source?: "mineru" | "pdfjs" | "html",
  ) => Promise<{
    state: PaperExtractState | null;
    blocks: import("../../shared/paper-extract-block").PaperExtractBlock[] | null;
  }>;
  extractOpenMd: (
    projectRoot: string,
    paperId: string,
    source: "mineru" | "pdfjs" | "html",
  ) => Promise<{ relativePath: string | null }>;
  extractTestMineru: (token?: string) => Promise<{ ok: true; message: string }>;
  extractResume: (projectRoot: string) => Promise<{ ok: boolean }>;
  onExtractProgress: (
    callback: (data: { projectRoot: string; progress: PaperExtractProgress }) => void,
  ) => () => void;
  onExtractProgressClear: (
    callback: (data: {
      projectRoot: string;
      paperId: string;
      source: PaperExtractSource;
    }) => void,
  ) => () => void;
  onExtractPdfCached: (
    callback: (data: { projectRoot: string; paperId: string }) => void,
  ) => () => void;
  onLiteraturePaperMaterialized: (
    callback: (data: { projectRoot: string; paperId: string }) => void,
  ) => () => void;
  onExtractStatusChanged: (
    callback: (data: { projectRoot: string; state: PaperExtractState }) => void,
  ) => () => void;
  onExtractAgentRequested: (
    callback: (data: {
      projectRoot: string;
      paperId: string;
      bibkey: string;
      title: string;
      source: "mineru" | "pdfjs" | "html";
    }) => void,
  ) => () => void;

  zoteroProbe: () => Promise<ZoteroStatus>;
  zoteroStatus: () => Promise<ZoteroStatus>;
  zoteroListCollections: () => Promise<ZoteroCollection[]>;
  zoteroGetProjectBinding: (projectRoot: string) => Promise<ZoteroProjectBinding>;
  zoteroSetProjectBinding: (
    projectRoot: string,
    collectionId: string | null,
    collectionName?: string | null,
  ) => Promise<ZoteroProjectBinding & { detached?: { papers: number; collections: number } }>;
  zoteroPullCollections: (projectRoot: string) => Promise<{
    collectionsUpserted: number;
    collectionsPruned: number;
  }>;
  zoteroPullCollection: (projectRoot: string) => Promise<ZoteroSyncResult>;
  zoteroGetLastSync: (projectRoot: string) => Promise<{ lastSyncAt: number | null }>;

  // Bibliographic catalog (global metadata resolution)
  bibliographyResolve: (opts: { doi?: string; arxivId?: string }) => Promise<{
    metadata: {
      title: string;
      authors: string | null;
      year: number | null;
      abstract: string | null;
      doi: string | null;
      arxiv_id: string | null;
      venue: string | null;
      type: string | null;
      source: string;
      pdfUrl?: string;
    };
    sourcesAttempted: string[];
  }>;

  // OpenCode chat operations
  chatDispose: () => Promise<{ success: boolean }>;
  chatPrewarm: (projectPath: string) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  /** Retry ACP spawn + optional project prewarm after failure. */
  chatEnsureAgent: (projectPath?: string) => Promise<import("../../shared/agent-status").AgentStatusSnapshot>;
  /** ACP lifecycle pushes (`chat:agentStatus`). */
  onAgentStatusChanged: (
    callback: (status: import("../../shared/agent-status").AgentStatusSnapshot) => void,
  ) => () => void;
  mcpEnsure: (projectPath: string) => Promise<{
    ok: boolean;
    ensure?: {
      added?: boolean;
      migrated?: boolean;
      reenabled?: boolean;
      removed?: boolean;
    };
    reloadedSessions?: number;
  }>;
  mcpApply: (projectPath: string) => Promise<{
    ok: boolean;
    reloadedSessions: number;
    error?: string;
  }>;
  agentListSkills: (projectPath: string) => Promise<Array<{
    fqid: string;
    id: string;
    name: string;
    description: string;
    skillDirRel: string;
    enabled: boolean;
    tokenCount: number;
    installOrigin?:
      | { adapter: "github"; repo: string; ref: string; path: string }
      | { adapter: "discovery"; indexUrl: string };
    origin: "bundled" | "registry" | "custom" | "plugin";
    originPackName?: string;
    removable: boolean;
  }>>;
  agentListRules: (projectPath: string) => Promise<Array<{
    id: string;
    name: string;
    description: string;
    apply: string;
    enabled: boolean;
    ruleDirRel: string;
  }>>;
  agentInstallRule: (projectPath: string, ruleId: string, content: string) => Promise<void>;
  agentDeleteRule: (projectPath: string, ruleId: string) => Promise<void>;
  agentSetRuleEnabled: (projectPath: string, ruleId: string, enabled: boolean) => Promise<void>;
  agentListSkillRegistries: (projectPath: string) => Promise<string[]>;
  agentListSkillLibrarySources: (projectPath: string) => Promise<Array<{
    id: string;
    kind: "bundled" | "remote" | "github";
    url?: string;
    repo?: string;
    ref?: string;
    subPath?: string;
    connected: boolean;
    name: string;
    description: string;
    removable: boolean;
  }>>;
  agentAddSkillLibrarySource: (projectPath: string, registryUrl: string) => Promise<{
    sources: Array<{
      id: string;
      kind: "bundled" | "remote" | "github";
      url?: string;
      repo?: string;
      ref?: string;
      subPath?: string;
      connected: boolean;
      name: string;
      description: string;
      removable: boolean;
    }>;
    indexUrl: string;
    skillCount: number;
    sourceKind: "github" | "registry";
  }>;
  agentFetchSkillLibraryCatalog: (
    projectPath: string,
    sourceId: string,
  ) => Promise<
    Array<{
      key: string;
      skillId: string;
      name: string;
      description: string;
      sourceId: string;
      sourceLabel: string;
      sourceKind: "bundled" | "remote" | "github";
      category?: "academic" | "general";
      registrySkillName?: string;
      artifactUrl?: string;
      artifactType?: "skill-md" | "archive" | "unknown";
      artifactFiles?: string[];
      indexUrl?: string;
      githubPackageId?: string;
    }>
  >;
  agentInstallLibraryCatalogItem: (
    projectPath: string,
    item: {
      key: string;
      skillId: string;
      name: string;
      description: string;
      sourceId: string;
      sourceLabel: string;
      sourceKind: "bundled" | "remote" | "github";
      category?: "academic" | "general";
      registrySkillName?: string;
      artifactUrl?: string;
      artifactType?: "skill-md" | "archive" | "unknown";
      artifactFiles?: string[];
      indexUrl?: string;
      githubPackageId?: string;
    },
  ) => Promise<{
    skillsCount: number;
    configPath: string;
    registryUrls: string[];
    installedIds: string[];
  }>;
  agentInstallAllFromLibrarySource: (
    projectPath: string,
    sourceId: string,
  ) => Promise<{
    skillsCount: number;
    configPath: string;
    registryUrls: string[];
    installedIds: string[];
  }>;
  agentUninstallAllFromLibrarySource: (
    projectPath: string,
    sourceId: string,
  ) => Promise<{
    skillsCount: number;
    configPath: string;
    registryUrls: string[];
    removedIds: string[];
  }>;
  agentRemoveSkillLibrarySource: (projectPath: string, sourceId: string) => Promise<{
    sources: Array<{
      id: string;
      kind: "bundled" | "remote" | "github";
      url?: string;
      repo?: string;
      ref?: string;
      subPath?: string;
      connected: boolean;
      name: string;
      description: string;
      removable: boolean;
    }>;
  }>;
  agentSetSkillLibrarySourceConnected: (
    projectPath: string,
    sourceId: string,
    connected: boolean,
  ) => Promise<{
    sources: Array<{
      id: string;
      kind: "bundled" | "remote" | "github";
      url?: string;
      repo?: string;
      ref?: string;
      subPath?: string;
      connected: boolean;
      name: string;
      description: string;
      removable: boolean;
    }>;
  }>;
  agentListBundledSkills: () => Promise<Array<{
    id: string;
    name: string;
    description: string;
    category: "academic" | "general";
    license?: string;
  }>>;
  agentInstallBundledSkill: (projectPath: string, skillId: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentReadBundledSkillMd: (skillId: string) => Promise<string | null>;
  agentSyncSkills: (projectPath: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentFetchSkillRegistry: (registryUrl: string) => Promise<{
    indexUrl: string;
    skills: Array<{
      name: string;
      description: string;
      type: "skill-md" | "archive" | "unknown";
      url: string;
      digest?: string;
      files?: string[];
    }>;
  }>;
  agentConnectSkillRegistry: (projectPath: string, registryUrl: string) => Promise<{
    registryUrls: string[];
    indexUrl: string;
    skillCount: number;
  }>;
  agentDisconnectSkillRegistry: (projectPath: string, registryUrl: string) => Promise<{ registryUrls: string[] }>;
  agentSetSkillEnabled: (
    projectPath: string,
    skillId: string,
    enabled: boolean,
  ) => Promise<{
    skillsCount: number;
    configPath: string;
    registryUrls: string[];
    skills: Array<{
      fqid: string;
      id: string;
      name: string;
      description: string;
      skillDirRel: string;
      enabled: boolean;
      tokenCount: number;
      installOrigin?:
        | { adapter: "github"; repo: string; ref: string; path: string }
        | { adapter: "discovery"; indexUrl: string };
      origin: "bundled" | "registry" | "custom" | "plugin";
      originPackName?: string;
      removable: boolean;
    }>;
  }>;
  agentInstallSkill: (projectPath: string, skillId: string, content: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentInstallSkillFromRegistry: (
    projectPath: string,
    skillName: string,
    artifactUrl: string,
    options?: {
      artifactType?: "skill-md" | "archive" | "unknown";
      files?: string[];
      indexUrl: string;
    },
  ) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentAnalyzeSkillSource: (input: string) => Promise<{
    adapter: "github" | "discovery" | "direct-url" | "bundled";
    label: string;
    cacheKey: string;
    origin:
      | { adapter: "github"; repo: string; ref: string; path: string }
      | { adapter: "discovery"; indexUrl: string };
    packages: Array<{
      id: string;
      name: string;
      description: string;
      path: string;
      hasRequirements: boolean;
      artifactUrl?: string;
      artifactType?: "skill-md" | "archive" | "unknown";
      artifactFiles?: string[];
      indexUrl?: string;
    }>;
    sharedBundle?: {
      id: string;
      label: string;
      path: string;
    };
    warnings: string[];
  }>;
  agentInstallSkillPackages: (
    projectPath: string,
    selection: {
      cacheKey: string;
      packageIds: string[];
      includeShared: boolean;
      origin:
        | { adapter: "github"; repo: string; ref: string; path: string }
        | { adapter: "discovery"; indexUrl: string };
    },
  ) => Promise<{
    skillsCount: number;
    configPath: string;
    registryUrls: string[];
    installedIds: string[];
  }>;
  agentReinstallSkill: (
    projectPath: string,
    skillId: string,
  ) => Promise<{
    skillsCount: number;
    configPath: string;
    registryUrls: string[];
    installedIds: string[];
  }>;
  agentCheckSkillUpdates: (projectPath: string) => Promise<
    Array<{
      skillId: string;
      status: "current" | "update_available" | "source_missing" | "unknown";
      updateAvailable: boolean;
      installedVersion?: string;
      remoteVersion?: string;
      message?: string;
    }>
  >;
  agentDeleteSkill: (projectPath: string, skillId: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  expertsList: (projectPath: string) => Promise<import("@shared/agent-experts").ExpertInfo[]>;
  orchestratorsList: (projectPath: string) => Promise<import("@shared/agent-experts").OrchestratorInfo[]>;
  expertsGetDetail: (
    projectPath: string,
    expertId: string,
  ) => Promise<(import("@shared/agent-experts").ExpertInfo & { instructions: string }) | null>;
  expertsSaveCustom: (
    projectPath: string,
    payload: import("@shared/agent-experts").SaveCustomExpertPayload,
    targetPackId?: string,
  ) => Promise<{ expert: import("@shared/agent-experts").ExpertInfo; experts: import("@shared/agent-experts").ExpertInfo[] }>;
  expertsDeleteCustom: (
    projectPath: string,
    expertId: string,
  ) => Promise<{ experts: import("@shared/agent-experts").ExpertInfo[] }>;
  orchestratorsGetDetail: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<(import("@shared/agent-experts").OrchestratorInfo & { instructions: string }) | null>;
  orchestratorsSaveCustom: (
    projectPath: string,
    payload: import("@shared/agent-experts").SaveCustomOrchestratorPayload,
    targetPackId?: string,
  ) => Promise<{
    orchestrator: import("@shared/agent-experts").OrchestratorInfo;
    orchestrators: import("@shared/agent-experts").OrchestratorInfo[];
  }>;
  orchestratorsDeleteCustom: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<{ orchestrators: import("@shared/agent-experts").OrchestratorInfo[] }>;
  chatSend: (args: {
    projectPath: string;
    worktreePath?: string;
    prompt: string;
    tabId?: string;
    sessionId?: string | null;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    provider?: string;
    thoughtLevel?: string;
    mcpServerAllowlist?: string[];
    skillIds?: string[];
    userDisplayContent?: Record<string, unknown>[];
    intensivePaperIds?: string[];
    hasPaperSnippets?: boolean;
    orchestratorId?: string | null;
    sessionAgent?: "build" | "plan";
    selectedExpertIds?: string[];
    promptImages?: Array<{ mimeType: string; data: string; name: string; uri?: string }>;
    promptFiles?: Array<{ uri: string; name: string; mimeType: string; size?: number }>;
  }) => Promise<void>;
  chatDescribeImages: (args: {
    providerId: string;
    modelId: string;
    images: Array<{ name: string; mimeType: string; data: string; uri?: string }>;
  }) => Promise<{ descriptions: Array<{ name: string; text: string; cached: boolean }> }>;
  chatCancel: (
    sessionId: string,
    opts?: { childrenOnly?: boolean; excludeSessionIds?: string[] },
  ) => Promise<{ aborted?: string[] } | void>;
  chatStopSubAgent: (args: {
    parentSessionId: string;
    taskToolUseId: string;
    subSessionId?: string;
    message: string;
    excludeSessionIds?: string[];
  }) => Promise<{
    ok: boolean;
    settled?: boolean;
    aborted?: string[];
    error?: string;
  }>;
  chatGetSubAgentActivity: (args: {
    parentSessionId: string;
    taskToolUseId: string;
    subSessionId?: string;
  }) => Promise<{
    subSessionId: string | null;
    blocks: Array<Record<string, unknown>>;
    status: "done" | "error" | "running";
    error?: string;
  }>;
  chatRegisterTab: (args: { tabId: string; sessionId: string; projectPath?: string }) => Promise<{ success: boolean }>;
  chatSyncIntensiveReading: (args: {
    sessionId: string;
    projectRoot: string;
    paperIds?: string[];
  }) => Promise<{ success: boolean }>;
  chatSetSessionAgent: (args: {
    sessionId: string;
    agent: "build" | "plan";
  }) => Promise<{ success: boolean; error?: string }>;
  chatSetPlanSuggestDismissed: (args: {
    sessionId: string;
    dismissed: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  chatResolvePlanSuggest: (args: {
    sessionId: string;
    decision: "accepted" | "dismissed" | "timed_out";
  }) => Promise<{ success: boolean; error?: string }>;
  chatCompact: (sessionId: string, projectPath: string) => Promise<{ ok: boolean } | void>;
  chatAnswer: (sessionId: string, answer: string) => Promise<void>;
  chatAnswerQuestion: (questionId: string, answer: string) => Promise<{ success: boolean; error?: string }>;
  chatReadPendingQuestion: (sessionId: string) => Promise<{
    ok: boolean;
    question?: string;
    options?: unknown[];
    multiSelect?: boolean;
  }>;
  chatAnswerPermission: (
    permissionId: string,
    approved: boolean,
    toolCallId?: string,
    opts?: { always?: boolean },
  ) => Promise<void>;
  chatStatus: (projectPath?: string) => Promise<import("../../shared/agent-status").AgentStatusSnapshot>;
  sessionList: (projectPath?: string) => Promise<Array<{ id: string; title: string; lastModified: number; createdAt: number; directory?: string }>>;
  sessionLoad: (sessionId: string, projectPath?: string, cwd?: string) => Promise<any[]>;
  sessionLoadWindow: (sessionId: string, projectPath: string | undefined, cwd: string | undefined, offset: number, limit: number) => Promise<{ messages: any[]; totalMessages: number }>;
  sessionGetDirectory: (sessionId: string) => Promise<string | null>;
  sessionRename: (args: { tabId: string; title: string; sessionId: string }) => Promise<void>;
  sessionReassignDirectory: (fromDirectory: string, toDirectory: string) => Promise<number>;
  sessionDelete: (sessionId: string, projectPath?: string) => Promise<{ success: boolean; error?: string }>;
  sessionTruncateToTurn: (args: {
    sessionId: string;
    projectPath: string;
    worktreePath?: string;
    turnIndex: number;
  }) => Promise<{ removedCount: number }>;
  sessionUndoTruncate: (args: {
    sessionId: string;
    projectPath: string;
    worktreePath?: string;
  }) => Promise<{ success: boolean }>;
  sessionGetContext: (projectPath: string, sessionId: string) => Promise<{
    tokens: number;
    updatedAt: number;
    windowSize?: number | null;
    source?: "usage_update" | "prompt_usage" | "estimate";
    hasSystemPromptBlock?: boolean;
    promptFingerprint?: string;
  } | null>;
  sessionGetUserDisplays: (projectPath: string, sessionId: string) => Promise<import("@/stores/chat-store").ContentBlock[][]>;
  sessionAppendUserDisplay: (
    projectPath: string,
    sessionId: string,
    content: import("@/stores/chat-store").ContentBlock[],
  ) => Promise<{ success: boolean }>;
  sessionGetPlanEvents: (
    projectPath: string,
    sessionId: string,
  ) => Promise<import("@/lib/chat/plan-ui-events").PlanUiEvent[]>;
  sessionGetTurnMetas: (
    projectPath: string,
    sessionId: string,
  ) => Promise<Record<number, import("@/stores/chat-store").TurnMessageMeta>>;
  sessionUpsertTurnMeta: (
    projectPath: string,
    sessionId: string,
    turnIndex: number,
    meta: import("@/stores/chat-store").TurnMessageMeta,
  ) => Promise<{ success: boolean }>;
  sessionUpsertPlanArtifact: (
    projectPath: string,
    sessionId: string,
    event: Extract<import("@/lib/chat/plan-ui-events").PlanUiEvent, { kind: "plan-artifact" }>,
  ) => Promise<{ success: boolean }>;
  sessionAppendPlanDecision: (
    projectPath: string,
    sessionId: string,
    event: Extract<import("@/lib/chat/plan-ui-events").PlanUiEvent, { kind: "plan-decision" }>,
  ) => Promise<{ success: boolean }>;
  sessionMarkPlanArtifactDiscarded: (
    projectPath: string,
    sessionId: string,
  ) => Promise<{ success: boolean }>;
  chatGetProviders: () => Promise<any[]>;
  chatGetEffortCatalog: () => Promise<import("../../shared/opencode-effort").EffortCatalogSnapshot>;
  chatGetOpenCodeModelsCatalog: () => Promise<
    import("../../shared/opencode-models-catalog").OpenCodeModelsCatalogSnapshot
  >;
  chatFetchProviderModels: (args: {
    providerId: string;
    apiKey?: string;
    baseUrl?: string;
  }) => Promise<{
    models: import("../../shared/openrouter-models").OpenRouterModelRow[];
    source: "api" | "cache";
  }>;
  chatFetchOpenRouterModels: (args?: {
    apiKey?: string;
    baseUrl?: string;
  }) => Promise<{
    models: import("../../shared/openrouter-models").OpenRouterModelRow[];
    source: "api" | "cache";
  }>;
  chatGetModelEffort: (args: {
    provider: string;
    modelId: string;
    fallback?: string[];
  }) => Promise<import("../../shared/opencode-effort").ModelEffortResult>;
  chatSetAuth: (provider: string, credentials: Record<string, string>) => Promise<{ success: boolean }>;
  chatTestConnection(args: { provider: string; apiKey: string; baseUrl?: string }): Promise<{ success: boolean; models?: string[] }>;

  // Chat events (Main → Renderer)
  onChatStream: (callback: (data: { tabId: string; type: string; data: any }) => void) => () => void;
  onChatComplete: (callback: (data: {
    tabId: string;
    sessionId: string;
    success: boolean;
    error?: string;
    errorCode?: string;
    emptyTurn?: boolean;
    tokenUsage?: any;
    contextUsed?: number | null;
    contextWindowSize?: number | null;
    contextSource?: "usage_update" | "prompt_usage" | "estimate" | null;
    promptStale?: boolean;
    planDraftMissing?: boolean;
  }) => void) => () => void;
  onChatPermission: (callback: (data: { tabId: string; permissionId: string; message: string; options: any; toolCallId?: string; toolName?: string; raw?: any }) => void) => () => void;
  onChatSessionCreated: (callback: (data: { tabId: string; sessionId: string }) => void) => () => void;
  removeChatListeners: () => void;

  // File watcher events (Main → Renderer)
  onFileChanged: (callback: (data: { projectRoot: string; changedPaths?: string[] }) => void) => () => void;
  onSkillsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => () => void;
  onExpertsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => () => void;
  // Settings operations
  settingsGet: () => Promise<{
    aiModel: string;
    theme: string;
    sidebarCollapsed: boolean;
    rightPanelCollapsed: boolean;
    lastProjectPath?: string | null;
    lastActiveFileId?: string | null;
    zoteroApiKey?: string;
    zoteroUserId?: string;
    zoteroLastBBTDetected?: boolean;
    pdfDarkMode?: "off" | "on" | "follow";
    autoCreateMainTex?: boolean;
    defaultDocClass?: "article" | "report" | "book";
    agentSystemPrompt?: string;
    editorSyntaxTheme?: string;
    defaultWorkspaceDirs?: import("./workspace").WorkspaceFolder[];
    defaultInitGit?: boolean;
  }>;
  settingsSet: (patch: Record<string, unknown>) => Promise<void>;
  settingsGetKnowledgeModules: (projectRoot?: string) => Promise<Array<{
    key: string;
    label: string;
    description: string;
    source: string;
    autoGenerated?: boolean;
    profileOnly?: boolean;
    selectableInProfile: boolean;
    injectPath: string;
    contentPreview: string;
    charCount: number;
    tokenCount: number;
  }>>;
  settingsGetBuiltinTools: () => Promise<Array<{
    name: string;
    label: string;
    description: string;
    category: string;
    schemaDescription: string;
  }>>;
  settingsGetLayers: () => Promise<Array<{ id: string; priority: number; source: string; userToggleable: boolean; enabled: boolean }>>;
  settingsSetLayer: (id: string, enabled: boolean) => Promise<void>;
  settingsGetAgentProjectConfig: (projectPath: string) => Promise<{ contextComponents: Record<string, boolean> }>;
  settingsSetAgentProjectConfig: (projectPath: string, config: { contextComponents: Record<string, boolean> }) => Promise<void>;
  settingsGetAssembledPrompt: (projectRoot?: string, userCustomPrompt?: string) => Promise<string>;
  settingsGetPromptStackPreview: (
    projectRoot?: string,
    userCustomPrompt?: string,
    orchestratorId?: string | null,
  ) => Promise<{
    orchestratorId?: string;
    orchestratorName?: string;
    markdown: string;
    tokenEncoding: import("../../shared/token-estimate").PromptTokenEncoding;
    totalTokenCount: number;
    sections: Array<{
      id: string;
      label: string;
      injectPath: string;
      fileHint?: string;
      charCount: number;
      tokenCount: number;
      content: string;
    }>;
  }>;
  settingsCountPromptTokens: (text: string) => Promise<import("../../shared/token-estimate").PromptTokenEstimate>;
  settingsComputePromptFingerprint: (projectRoot?: string) => Promise<string>;
  settingsGetDefaultPersona: () => Promise<string>;

  // Commands operations
  commandsList: (projectRoot?: string | null) => Promise<import("@commands/types").CommandDef[]>;
  commandsExpand: (name: string, rawInput: string, projectRoot: string) => Promise<string>;
  commandsCreate: (
    projectRoot: string,
    payload: import("@commands/types").CreateCommandPayload,
  ) => Promise<import("@commands/types").CommandDef>;
  commandsUpdate: (
    projectRoot: string,
    id: string,
    payload: import("@commands/types").UpdateCommandPayload,
  ) => Promise<import("@commands/types").CommandDef>;
  commandsDelete: (projectRoot: string, id: string) => Promise<void>;
  commandsToggle: (projectRoot: string, id: string, enabled: boolean) => Promise<import("@commands/types").CommandDef[]>;
  commandsReload: (projectRoot?: string | null) => Promise<import("@commands/types").CommandDef[]>;
  commandsPreviewImport: (
    projectRoot: string,
    pack: unknown,
  ) => Promise<import("@commands/export-import").CommandImportPreview>;
  commandsImportPack: (
    projectRoot: string,
    pack: unknown,
    strategy: import("@commands/export-import").CommandImportConflictStrategy,
  ) => Promise<import("@commands/export-import").CommandImportResult>;
  commandsWriteExportFile: (filePath: string, projectRoot: string) => Promise<void>;
  commandsReadImportFile: (filePath: string) => Promise<unknown>;

  // Agent Packs（生命周期 + 视图，§9.5）
  packsListCatalog: (
    projectRoot: string,
  ) => Promise<import("../../shared/packs/types").ProjectPackView[]>;
  packsInstall: (
    projectRoot: string,
    packId: string,
  ) => Promise<{
    applied?: boolean;
    suggestedOrchestrator?: import("../../shared/packs/types").Fqid;
  }>;
  packsSetEnabled: (
    projectRoot: string,
    packId: string,
    enabled: boolean,
  ) => Promise<{
    suggestedOrchestrator?: import("../../shared/packs/types").Fqid;
    /** 停用该 pack 时，默认主 agent 若属于它 → 已转移回 core 默认 */
    defaultMovedTo?: import("../../shared/packs/types").Fqid;
  }>;
  packsUninstall: (projectRoot: string, packId: string) => Promise<void>;
  packsSetContentEnabled: (projectRoot: string, fqid: string, enabled: boolean) => Promise<void>;
  packsSaveOverride: (
    projectRoot: string,
    fqid: string,
    patch: import("../../shared/packs/types").ContentOverride,
  ) => Promise<void>;
  packsGetCoreState: (projectRoot: string) => Promise<{
    defaultOrchestratorId: string | null;
    defaultOrchestratorFqid: string | null;
    coreExpertDisabledCount: number;
    coreExpertOverrideCount: number;
    coreOrchestratorDisabledCount: number;
    coreOrchestratorOverrideCount: number;
  }>;
  packsResetCoreDefaults: (
    projectRoot: string,
    kind: "expert" | "orchestrator",
  ) => Promise<void>;
  packsResolveBadge: (
    projectRoot: string,
    fqidOrId: string,
  ) => Promise<import("../../shared/packs/types").BadgeInfo | null>;
  packsGetContentView: (
    projectRoot: string,
    kind: import("../../shared/packs/types").ContentKind,
  ) => Promise<import("../../shared/packs/types").ResolvedContent[]>;
  packsSetDefaultOrchestrator: (projectRoot: string, fqid: string) => Promise<void>;
  packsGetPackContents: (packId: string) => Promise<{
    kind: import("../../shared/packs/types").ContentKind;
    id: string;
    name: string;
    description: string;
  }[]>;
  packsListProjectMcps: (
    projectRoot: string,
  ) => Promise<import("../../shared/packs/types").ResolvedMcp[]>;

  // User teams (app-level, like installed teams)
  userPacksList: () => Promise<
    Array<{ packId: string; name: string; description: string; version: string }>
  >;
  userPacksCreate: (
    name: string,
    description?: string,
  ) => Promise<{ packId: string; name: string; description: string; version: string }>;
  userPacksDelete: (packId: string) => Promise<void>;

  // Workspace operations
  workspaceGetConfig: (projectRoot: string) => Promise<import("./workspace").WorkspaceFolder[]>;
  workspaceUpdateConfig: (projectRoot: string, dirs: import("./workspace").WorkspaceFolder[]) => Promise<{ success: boolean; errors?: string[] }>;
  workspaceCreateFolders: (projectRoot: string, dirs?: import("./workspace").WorkspaceFolder[]) => Promise<{ created: string[]; errors: { folder: string; error: string }[] }>;
  workspaceEnsureMainTex: (projectRoot: string) => Promise<{ created: boolean; relativePath?: string }>;

  // Browser operations
  browserInit: (projectRoot: string) => Promise<BrowserStateData>;
  browserSaveBookmarks: (projectRoot: string, bookmarks: BrowserBookmark[]) => Promise<{ success: boolean; error?: string }>;
  browserSaveRecent: (projectRoot: string, recent: BrowserRecentVisit[]) => Promise<{ success: boolean; error?: string }>;
  browserClearCookies: () => Promise<{ success: boolean; error?: string }>;
  browserClearCache: () => Promise<{ success: boolean; error?: string }>;

  // Terminal operations
  terminalCreate: (args: {
    sessionId: string;
    tabId: string;
    projectRoot: string;
    cwd: string;
  }) => Promise<{ shell: string; cwd: string; pid: number; tabId: string }>;
  terminalDestroy: (args: { sessionId: string }) => Promise<void>;
  terminalDestroyTab: (args: { tabId: string }) => Promise<void>;
  terminalDestroyTabs: (args: { tabIds: string[] }) => Promise<void>;
  terminalWrite: (args: { sessionId: string; data: string }) => Promise<void>;
  terminalResize: (args: { sessionId: string; cols: number; rows: number }) => Promise<void>;
  terminalEnvInfo: () => Promise<TerminalEnvInfo>;
  terminalLoadConfig: (projectRoot: string) => Promise<TerminalConfig>;
  terminalSaveConfig: (projectRoot: string, config: TerminalConfig) => Promise<void>;
  terminalRunAiBash: (args: {
    sessionId: string;
    chatTabId: string;
    toolCallId: string;
    command: string;
    cwd?: string;
  }) => Promise<{ output: string; exitCode: number; cwd: string }>;
  terminalRegisterBashJob: (args: {
    sessionId: string;
    toolCallId: string;
    command: string;
  }) => Promise<void>;
  terminalDestroyAllAiPty: () => Promise<void>;

  // Terminal events (Main → Renderer)
  onTerminalData: (callback: (data: { sessionId: string; tabId: string; data: string }) => void) => () => void;
  onTerminalExit: (callback: (data: { sessionId: string; tabId: string; exitCode: number }) => void) => () => void;
  onTerminalAiStream: (callback: (data: {
    sessionId: string;
    chatTabId: string;
    requestId: string;
    toolCallId?: string;
    chunk: string;
    phase: "output";
  }) => void) => () => void;
  onTerminalAiExit: (callback: (data: {
    sessionId: string;
    chatTabId: string;
    requestId: string;
    toolCallId?: string;
    exitCode: number;
    cwd: string;
  }) => void) => () => void;

  // Git operations
  gitWarmup: (projectRoot: string) => Promise<{ ok: boolean }>;
  logFetch: (params: import("@shared/log-types").LogFetchParams) => Promise<import("@shared/log-types").LogFetchResult>;
  gitIsRepo: (projectRoot: string) => Promise<boolean>;
  gitStatus: (projectRoot: string) => Promise<GitStatusData>;
  gitBranches: (projectRoot: string) => Promise<GitBranchesData>;
  gitCheckout: (projectRoot: string, branch: string) => Promise<GitResultData>;
  gitCreateBranch: (projectRoot: string, branchName: string) => Promise<GitResultData>;
  gitDiff: (projectRoot: string, filePath: string, indexStatus: string, worktreeStatus: string, staged: boolean, unstaged: boolean, untracked: boolean, view?: "staged" | "unstaged" | "all") => Promise<GitFileDiffData>;
  gitStage: (projectRoot: string, filePath: string) => Promise<GitResultData>;
  gitUnstage: (projectRoot: string, filePath: string) => Promise<GitResultData>;
  gitStageAll: (projectRoot: string, filePaths: string[]) => Promise<GitResultData>;
  gitUnstageAll: (projectRoot: string, filePaths: string[]) => Promise<GitResultData>;
  gitInit: (projectRoot: string) => Promise<GitResultData>;
  gitCommit: (projectRoot: string, message: string) => Promise<GitResultData>;
  gitCommitAll: (projectRoot: string, filePaths: string[], message: string) => Promise<GitResultData>;
  gitDeleteBranch: (projectRoot: string, branch: string) => Promise<GitResultData>;
  gitRevert: (projectRoot: string, hash: string) => Promise<GitResultData>;
  gitReset: (projectRoot: string, hash: string, mode: "soft" | "mixed" | "hard") => Promise<GitResultData>;
  gitDiffStats: (projectRoot: string) => Promise<{
    unstaged: Record<string, { added: number; deleted: number }>;
    staged: Record<string, { added: number; deleted: number }>;
  }>;
  gitLog: (projectRoot: string, maxCount?: number) => Promise<Array<{ hash: string; message: string; author: string; date: string; graph: string; refs: string; insertions: number; deletions: number }>>;
  gitDiscard: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) => Promise<GitResultData>;
  gitPush: (projectRoot: string) => Promise<GitResultData & { output?: string }>;
  gitMerge: (projectRoot: string, sourceBranch: string) => Promise<GitMergeResultData>;
  gitMergeNoCommit: (projectRoot: string, sourceBranch: string) => Promise<GitMergeResultData>;
  gitAbortMerge: (projectRoot: string) => Promise<GitResultData>;
  gitStash: (projectRoot: string, message?: string) => Promise<GitResultData>;
  gitStashPop: (projectRoot: string) => Promise<GitResultData>;
  gitCommitDiff: (projectRoot: string, hash: string) => Promise<string>;
  gitCommitFiles: (projectRoot: string, hash: string) => Promise<Array<{ path: string; added: number; deleted: number }>>;
  gitCommitFileDiff: (projectRoot: string, hash: string, filePath: string) => Promise<{ path: string; oldContent: string; newContent: string }>;
  gitCheckIgnore: (projectRoot: string, relativePaths: string[]) => Promise<string[]>;

  // Theme — glass vibrancy synchronization
  themeSetGlassMode: (mode: "light" | "dark" | "system") => Promise<void>;
  themeListSystemFonts: () => Promise<{ family: string; monospace: boolean }[]>;

  // Worktree operations
  worktreeList: (projectRoot: string) => Promise<WorktreeInfo[]>;
  worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) => Promise<WorktreeInfo>;
  worktreeRemove: (projectRoot: string, name: string) => Promise<void>;
  worktreeMergeStatus: (projectRoot: string, name: string) => Promise<MergeStatus>;
  worktreeMoveSessions: (projectRoot: string, worktreeName: string) => Promise<number>;
  worktreeBranches: (projectRoot: string) => Promise<BranchInfo[]>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
