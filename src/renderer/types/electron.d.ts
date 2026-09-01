import type { AppSettings } from "../stores/settings-store";
import type { CompileAgentCompleteEvent } from "@shared/compile/artifact-key";
import type { TypstCliFormat } from "@shared/compile/typst-format";
import type {
  TypstDidChangeArgs,
  TypstDidCloseArgs,
  TypstDidOpenArgs,
  TypstDiagnosticsEvent,
  TypstEnsureSessionArgs,
  TypstIpcError,
  TypstPreviewReadyEvent,
  TypstPreviewStartArgs,
  TypstPreviewStopArgs,
  TypstScrollToEvent,
} from "@shared/typst/session";

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
/** Installed app version for Settings → About. */
export interface AboutVersions {
  appVersion: string;
}

export interface CompilerStatus {
  texlive: TexliveStatus;
  tectonic: boolean;
}

export type {
  ExtractProgressPhase,
  PaperExtractProgress,
  PaperExtractSource,
  PaperExtractState,
  PaperExtractStatesByPaper,
  PaperExtractStatus,
} from "@shared/literature/paper-extract";

export type {
  BibFallbackEntry,
  CitationHealthBibCheck,
  CitationHealthLibraryCheck,
  CitationHealthReport,
  ImportFromManuscriptBibResult,
  MergeIntoManuscriptBibResult,
} from "@shared/literature/citation-health-types";

export type {
  LiteratureAttachLocalPdfConflict,
  LiteratureAttachLocalPdfResult,
  LiteraturePaper,
  PaperAiMetadataStatus,
} from "@shared/literature/paper";

export type {
  PaperCitationEntry,
  PaperCitationNetworkResult,
  PaperCitationSection,
} from "@shared/literature/paper-citation-network";

export type { CompileAgentCompleteEvent };
export type {
  TypstDidChangeArgs,
  TypstDidCloseArgs,
  TypstDidOpenArgs,
  TypstDiagnosticsEvent,
  TypstEnsureSessionArgs,
  TypstIpcError,
  TypstPreviewReadyEvent,
  TypstPreviewStartArgs,
  TypstPreviewStopArgs,
  TypstScrollToEvent,
};

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

export type {
  BranchInfo,
  GitBranchesData,
  GitFileDiffData,
  GitFileStatusData,
  GitMergeResultData,
  GitAddRemoteResultData,
  GitPushResultData,
  GitRemoteInfo,
  GitResultData,
  GitStatusData,
  GitSyncResultData,
  GitTrackingData,
  MergeStatus,
  WorktreeInfo,
} from "@shared/git";

export type {
  GhAuthStatus,
  GhPrCreateInput,
  GhPrCreateResult,
  GhPrViewWebResult,
} from "@shared/git-hosting";

export type {
  HostHandshake,
  RemoteBootstrapLogLine,
  RemoteConnectResult,
  RemoteConnectionSnapshot,
  RemoteConnectionState,
  SshConfigHost,
  SshProfile,
} from "@shared/remote";


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
  fsWatchStart: () => Promise<void>;
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
    runningCount?: number,
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
      id: "files" | "literature" | "experiments";
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
      modeId: "files" | "literature" | "experiments";
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
    options?: {
      initGit?: boolean;
    },
  ) => Promise<void>;
  /** Validate a project path and return its canonical root without authorizing watchers. */
  projectOpen: (rootPath: string) => Promise<{ rootPath: string }>;
  /** Authorize the current project after the UI commits it; returns its canonical root. */
  projectActivate: (rootPath: string) => Promise<{ rootPath: string }>;
  /** Stop lifecycle-owned services and revoke project authorization. */
  projectClose: () => Promise<void>;
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
  /** Installed PrismNext app version. */
  aboutGetVersions: () => Promise<AboutVersions>;
  /** Open-core Pro license (activation key). Null when Free / inactive. */
  proGetLicense: () => Promise<import("../../shared/pro").LicenseSnapshot | null>;
  proActivate: (
    rawKey: string,
  ) => Promise<import("../../shared/pro").ActivateLicenseResult>;
  proClearLicense: () => Promise<{ ok: true }>;
  projectEnsure: (rootPath: string) => Promise<{ success: boolean }>;
  workbenchGetState: () => Promise<import("../../shared/workbench/api").WorkbenchState>;
  workbenchSetDefault: (
    projectId: string,
  ) => Promise<import("../../shared/workbench/api").WorkbenchState>;
  workbenchSetDefaultFromFolder: (
    absPath: string,
  ) => Promise<import("../../shared/workbench/api").WorkbenchState>;
  workbenchOpenFolder: (
    absPath: string,
  ) => Promise<import("../../shared/workbench/api").WorkbenchOpenResult>;
  workbenchRemoveProject: (
    projectId: string,
  ) => Promise<import("../../shared/workbench/api").WorkbenchState>;
  workbenchUpdateDisplayName: (
    projectId: string,
    displayName: string,
  ) => Promise<import("../../shared/workbench/api").WorkbenchState>;
  workbenchReorderProjects: (
    projectIds: string[],
  ) => Promise<import("../../shared/workbench/api").WorkbenchState>;
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
    doc: import("../../shared/research/plan").ResearchPlanDoc;
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
        experiments: import("../../shared/experiments/log").ExperimentSummary[];
        /** Registry dirs with missing/corrupt meta.json (Bug #19). */
        corruptIds?: string[];
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentRead: (args: { projectRoot: string; id: string; runsLimit?: number }) => Promise<
    | {
        ok: true;
        meta: import("../../shared/experiments/log").ExperimentMeta;
        runs: import("../../shared/experiments/log").ExperimentRunEntry[];
        /** Total runs in jsonl (may exceed `runs.length` when limited). */
        runCount: number;
        lastRunAt: string | null;
        experimentRoot: string;
        registryRoot: string;
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentArchive: (args: { projectRoot: string; id: string }) => Promise<
    | { ok: true; meta: import("../../shared/experiments/log").ExperimentMeta }
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
        meta: import("../../shared/experiments/log").ExperimentMeta;
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
    | { ok: true; meta: import("../../shared/experiments/log").ExperimentMeta }
    | { ok: false; error: string; hint?: string }
  >;
  experimentUpdateRun: (args: {
    projectRoot: string;
    id: string;
    runId: string;
    notes: string;
  }) => Promise<
    | { ok: true; run: import("../../shared/experiments/log").ExperimentRunEntry }
    | { ok: false; error: string; hint?: string }
  >;
  experimentRestore: (args: { projectRoot: string; id: string }) => Promise<
    | { ok: true; meta: import("../../shared/experiments/log").ExperimentMeta }
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
        env: import("../../shared/experiments/log").ExperimentEnv;
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
    kind?: import("../../shared/experiments/log").ExperimentRunKind;
    chatSessionId?: string | null;
  }) => Promise<
    | { ok: true; runId: string; executionId?: string; status: "started" }
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
        snapshot: import("@shared/experiments/results-snapshot").ExperimentResultsSnapshot;
      }
    | { ok: false; error: string; hint?: string }
  >;
  interactionGet: (
    projectRoot: string,
    id: string,
  ) => Promise<{ spec: import("../../shared/interaction/spec").InteractionSpec | null; error?: string }>;
  interactionList: (projectRoot: string) => Promise<{ ids: string[] }>;
  interactionWrite: (args: {
    projectRoot: string;
    spec: import("../../shared/interaction/spec").InteractionSpec;
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
    callback: (data: import("../../shared/experiments/log").ExperimentRunCompleteEvent) => void,
  ) => () => void;
  onExperimentRunStarted: (
    callback: (data: import("../../shared/experiments/log").ExperimentRunStartedEvent) => void,
  ) => () => void;
  onExperimentRunOutput: (
    callback: (data: import("../../shared/experiments/log").ExperimentRunOutputEvent) => void,
  ) => () => void;

  // Provenance - trace a claimed artifact / run back to its generating command.
  provenanceGetForArtifact: (
    projectRoot: string,
    artifactPath: string,
  ) => Promise<
    | {
        run: import("../../shared/experiments/provenance").ProvenanceRunRecorded;
        linkMethod: import("../../shared/experiments/provenance").ProvenanceLinkMethod;
      }
    | null
  >;
  provenanceGetForRun: (
    projectRoot: string,
    runId: string,
  ) => Promise<import("../../shared/experiments/provenance").ProvenanceRunRecorded | null>;

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
  onSetPromptInternals: (callback: (enabled: boolean) => void) => () => void;

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
  compileTypstExport: (
    projectDir: string,
    mainFile: string,
    format: TypstCliFormat,
    opts?: { dirtyFiles?: Array<{ relPath: string; content: string }> },
  ) => Promise<
    | { canceled: true }
    | { canceled: false; ok: true; files: string[]; buildDir: string; stdout?: string }
    | { canceled: false; ok: false; error: string; stdout?: string }
  >;
  compileDetectTexlive: (args?: { projectRoot?: string }) => Promise<CompilerStatus>;
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
    callback: (data: CompileAgentCompleteEvent) => void,
  ) => () => void;

  typstEnsureSession: (
    args: TypstEnsureSessionArgs,
  ) => Promise<{ ok: true } | TypstIpcError>;
  typstDidOpen: (args: TypstDidOpenArgs) => Promise<{ ok: true } | TypstIpcError>;
  typstDidChange: (args: TypstDidChangeArgs) => Promise<{ ok: true } | TypstIpcError>;
  typstDidClose: (args: TypstDidCloseArgs) => Promise<{ ok: true } | TypstIpcError>;
  typstPreviewStart: (
    args: TypstPreviewStartArgs,
  ) => Promise<TypstPreviewReadyEvent | TypstIpcError>;
  typstPreviewStop: (args: TypstPreviewStopArgs) => Promise<{ ok: true } | TypstIpcError>;
  onTypstPreviewReady: (callback: (data: TypstPreviewReadyEvent) => void) => () => void;
  onTypstDiagnostics: (callback: (data: TypstDiagnosticsEvent) => void) => () => void;
  onTypstScrollTo: (callback: (data: TypstScrollToEvent) => void) => () => void;

  // Literature library
  literatureList: (projectRoot: string) => Promise<LiteraturePaper[]>;
  literatureResolveAbs: (projectRoot: string, rel: string) => Promise<string | null>;
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
    citation: import("../../shared/literature/citation-staging").StagedCitationImportInput,
  ) => Promise<
    | import("../../shared/literature/citation-staging").StagedCitationCreateCancelledResult
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
    callback: (data: import("../../shared/literature/citation-staging").StagedAddProgressEvent) => void,
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
    blocks: import("../../shared/literature/paper-extract-block").PaperExtractBlock[] | null;
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
  mcpReadTeamJson: (
    projectPath: string,
    teamId?: string,
  ) => Promise<{ teamId: string; content: string }>;
  mcpWriteTeamJson: (
    projectPath: string,
    content: string,
    teamId?: string,
  ) => Promise<{
    ok: boolean;
    teamId?: string;
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
    originTeamName?: string;
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
      originTeamName?: string;
      removable: boolean;
    }>;
  }>;
  agentInstallSkill: (
    projectPath: string,
    skillId: string,
    content: string,
    targetTeamId?: string,
  ) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
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
  agentHomeSkillsDir: () => Promise<string>;
  subagentsList: (projectPath: string) => Promise<import("@shared/agent/subagents").SubagentInfo[]>;
  orchestratorsList: (projectPath: string) => Promise<import("@shared/agent/subagents").OrchestratorInfo[]>;
  subagentsGetDetail: (
    projectPath: string,
    expertId: string,
  ) => Promise<(import("@shared/agent/subagents").SubagentInfo & { instructions: string }) | null>;
  subagentsSaveCustom: (
    projectPath: string,
    payload: import("@shared/agent/subagents").SaveCustomSubagentPayload,
    targetTeamId?: string,
  ) => Promise<{ expert: import("@shared/agent/subagents").SubagentInfo; experts: import("@shared/agent/subagents").SubagentInfo[] }>;
  subagentsListRosterReferrers: (
    projectPath: string,
    expertId: string,
  ) => Promise<Array<{ teamId: string; teamName: string; orchestratorFqid: string }>>;
  subagentsDeleteCustom: (
    projectPath: string,
    expertId: string,
  ) => Promise<{ experts: import("@shared/agent/subagents").SubagentInfo[] }>;
  orchestratorsGetDetail: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<(import("@shared/agent/subagents").OrchestratorInfo & { instructions: string }) | null>;
  orchestratorsSaveCustom: (
    projectPath: string,
    payload: import("@shared/agent/subagents").SaveCustomOrchestratorPayload,
    targetTeamId?: string,
  ) => Promise<{
    orchestrator: import("@shared/agent/subagents").OrchestratorInfo;
    orchestrators: import("@shared/agent/subagents").OrchestratorInfo[];
  }>;
  orchestratorsDeleteCustom: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<{ orchestrators: import("@shared/agent/subagents").OrchestratorInfo[] }>;
  agentStatus: (args?: { projectRoot?: string }) => Promise<import("../../shared/agent/api").AgentStatus>;
  agentSend: (args: import("../../shared/agent/api").AgentSendInput) => Promise<import("../../shared/agent/api").AgentSendResult>;
  agentCancel: (args: { conversationId: string }) => Promise<{ ok: boolean }>;
  agentCancelSubagent: (
    args: import("../../shared/agent/api").AgentCancelSubagentInput,
  ) => Promise<{ ok: boolean }>;
  agentDispose: (args?: { conversationId?: string }) => Promise<{ ok: boolean }>;
  agentResolvePermission: (args: {
    requestId: string;
    decision: "allow" | "deny";
  }) => Promise<{ ok: boolean }>;
  agentListSessions: (projectRoot: string) => Promise<import("../../shared/agent/api").AgentSessionSummary[]>;
  agentListSessionsByProjectId: (
    args: import("../../shared/agent/api").AgentListSessionsByProjectIdArgs,
  ) => Promise<import("../../shared/agent/api").AgentSessionSummary[]>;
  agentLoadSession: (
    args: import("../../shared/agent/api").AgentLoadSessionInput,
  ) => Promise<import("../../shared/agent/api").AgentLoadSessionResult>;
  agentRenameSession: (
    args: import("../../shared/agent/api").AgentRenameSessionInput,
  ) => Promise<{ ok: boolean }>;
  agentGenerateSessionTitle: (
    args: import("../../shared/agent/api").AgentGenerateSessionTitleInput,
  ) => Promise<import("../../shared/agent/api").AgentGenerateSessionTitleResult>;
  agentDeleteSession: (
    args: import("../../shared/agent/api").AgentDeleteSessionInput,
  ) => Promise<{ ok: boolean }>;
  agentAnswerQuestion: (
    args: import("../../shared/agent/api").AgentAnswerQuestionInput,
  ) => Promise<{ ok: boolean }>;
  agentResolvePlanSuggest: (
    args: import("../../shared/agent/api").AgentResolvePlanSuggestInput,
  ) => Promise<{ ok: boolean }>;
  agentListModels: (
    args: import("../../shared/agent/api").AgentListModelsInput,
  ) => Promise<import("../../shared/agent/api").AgentListModelsResult>;
  agentListModelsCatalog: () => Promise<import("../../shared/agent/api").AgentModelsCatalogSnapshot>;
  agentTestConnection: (
    args: import("../../shared/agent/api").AgentTestConnectionInput,
  ) => Promise<import("../../shared/agent/api").AgentTestConnectionResult>;
  agentGetModelEffort: (
    args: import("../../shared/agent/api").AgentModelEffortInput,
  ) => Promise<import("../../shared/agent/api").AgentModelEffortResult>;
  agentGetEffortCatalog: () => Promise<import("../../shared/agent/api").AgentEffortCatalogSnapshot>;
  agentCompact: (
    args: import("../../shared/agent/api").AgentCompactInput,
  ) => Promise<import("../../shared/agent/api").AgentCompactResult>;
  agentDescribeImages: (
    args: import("../../shared/agent/api").AgentDescribeImagesInput,
  ) => Promise<import("../../shared/agent/api").AgentDescribeImagesResult>;
  agentTruncateToTurn: (
    args: import("../../shared/agent/api").AgentTruncateInput,
  ) => Promise<import("../../shared/agent/api").AgentTruncateResult>;
  agentUndoTruncate: (
    args: import("../../shared/agent/api").AgentUndoTruncateInput,
  ) => Promise<import("../../shared/agent/api").AgentUndoTruncateResult>;
  agentReassignDirectory: (
    args: import("../../shared/agent/api").AgentReassignDirectoryInput,
  ) => Promise<import("../../shared/agent/api").AgentReassignDirectoryResult>;
  agentReassignSessionProject: (
    args: import("../../shared/agent/api").AgentReassignSessionProjectInput,
  ) => Promise<import("../../shared/agent/api").AgentReassignSessionProjectResult>;
  agentSyncIntensiveReading: (
    args: import("../../shared/agent/api").AgentSyncIntensiveReadingInput,
  ) => Promise<{ ok: boolean }>;
  agentGetPlanEvents: (
    conversationId: string,
  ) => Promise<import("../../shared/agent/api").AgentPlanEvent[]>;
  agentUpsertPlanArtifact: (
    args: import("../../shared/agent/api").AgentPlanArtifactInput,
  ) => Promise<{ ok: boolean }>;
  agentAppendPlanDecision: (
    args: import("../../shared/agent/api").AgentPlanDecisionInput,
  ) => Promise<{ ok: boolean }>;
  agentMarkPlanArtifactDiscarded: (conversationId: string) => Promise<{ ok: boolean }>;
  agentUpsertTurnMeta: (
    args: import("../../shared/agent/api").AgentTurnMetaInput,
  ) => Promise<{ ok: boolean }>;
  onAgentEvent: (callback: (event: import("../../shared/agent/runtime").AgentEvent) => void) => () => void;
  // File watcher events (Main → Renderer)
  onFileChanged: (callback: (data: { projectRoot: string; changedPaths?: string[] }) => void) => () => void;
  onSkillsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => () => void;
  onExpertsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => () => void;
  // Settings operations
  settingsGet: () => Promise<AppSettings>;
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
    promptGuidelines: string[];
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
    sessionTeamId?: string | null,
  ) => Promise<{
    teamId?: string;
    teamName?: string;
    orchestratorId?: string;
    orchestratorName?: string;
    markdown: string;
    tokenEncoding: import("../../shared/providers/token-estimate").PromptTokenEncoding;
    totalTokenCount: number;
    liveSystemPrompt?: string;
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
  settingsCountPromptTokens: (text: string) => Promise<import("../../shared/providers/token-estimate").PromptTokenEstimate>;
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
  teamsList: (
    projectRoot: string,
  ) => Promise<import("../../shared/teams/view").TeamViewV2[]>;
  teamsInstall: (
    teamId: string,
  ) => Promise<{
    applied?: boolean;
    suggestedActiveTeam?: string;
  }>;
  teamsSetEnabled: (
    projectRoot: string,
    teamId: string,
    enabled: boolean | null,
    scope?: "app" | "project",
  ) => Promise<{
    suggestedActiveTeam?: string;
    defaultMovedTo?: string;
  }>;
  teamsUninstall: (teamId: string) => Promise<void>;
  teamsSetAssetEnabled: (
    projectRoot: string,
    fqid: string,
    enabled: boolean | null,
    scope?: "app" | "project",
  ) => Promise<void>;
  teamsSaveAssetOverride: (
    projectRoot: string,
    fqid: string,
    patch: import("../../shared/teams/types").AssetOverride,
    scope?: "app" | "project",
  ) => Promise<void>;
  teamsGetActiveTeam: (
    projectRoot: string,
    sessionTeamId?: string | null,
  ) => Promise<import("../../shared/teams/view").TeamViewV2 | null>;
  teamsSetActiveTeam: (projectRoot: string, teamId: string, scope?: "project" | "app") => Promise<void>;
  teamsGetRoster: (
    projectRoot: string,
    teamId: string,
  ) => Promise<import("../../shared/teams/view").RosterView | null>;
  teamsGetSkillsRoster: (
    projectRoot: string,
    teamId: string,
  ) => Promise<import("../../shared/teams/view").RosterView | null>;
  teamsGetCommandsRoster: (
    projectRoot: string,
    teamId: string,
  ) => Promise<import("../../shared/teams/view").RosterView | null>;
  teamsCreate: (
    projectRoot: string,
    input: {
      name: string;
      description?: string;
      longDescription?: string;
      tags?: string[];
      scope: "app" | "project";
      leadName?: string;
      leadInstructions?: string;
      icon?: import("../../shared/platform/icon-spec").IconSpec | null;
      iconImagePngBase64?: string;
    },
  ) => Promise<{ teamId: string; dir: string }>;
  teamsUpdateIcon: (
    teamId: string,
    icon: import("../../shared/platform/icon-spec").IconSpec | null,
    projectRoot?: string | null,
  ) => Promise<void>;
  teamsSetIconImage: (
    teamId: string,
    pngBase64: string,
    projectRoot?: string | null,
  ) => Promise<void>;
  teamsDelete: (teamId: string, projectRoot?: string) => Promise<void>;
  teamsGetCoreState: (projectRoot: string) => Promise<{
    defaultOrchestratorId: string | null;
    defaultOrchestratorFqid: string | null;
    coreSubagentDisabledCount: number;
    coreSubagentOverrideCount: number;
    coreOrchestratorDisabledCount: number;
    coreOrchestratorOverrideCount: number;
  }>;
  teamsResetCoreDefaults: (
    projectRoot: string,
    kind: "subagent" | "orchestrator",
  ) => Promise<void>;
  teamsResolveOrigin: (
    projectRoot: string,
    fqidOrId: string,
  ) => Promise<import("../../shared/teams/types").OriginInfo | null>;
  teamsListAssets: (
    projectRoot: string,
    kind: import("../../shared/teams/types").AssetKind,
  ) => Promise<import("../../shared/teams/view").AssetViewV2[]>;
  teamsSetDefaultOrchestrator: (projectRoot: string, fqid: string) => Promise<void>;
  teamsGetTeamContents: (
    teamId: string,
    projectRoot?: string | null,
  ) => Promise<{
    kind: import("../../shared/teams/types").AssetKind;
    id: string;
    name: string;
    description: string;
  }[]>;
  teamsListProjectMcps: (
    projectRoot: string,
  ) => Promise<import("../../shared/teams/view").AssetViewV2[]>;
  teamsListMcp: (
    projectRoot: string,
  ) => Promise<Array<{ name: string; enabled: boolean; origin: string; autoStart: boolean }>>;

  // User teams (app-level, like installed teams)
  teamsListUserTeams: () => Promise<
    Array<{ teamId: string; name: string; description: string; version: string }>
  >;
  teamsCreateUserTeam: (
    name: string,
    description?: string,
  ) => Promise<{ teamId: string; name: string; description: string; version: string }>;
  teamsDeleteUserTeam: (teamId: string) => Promise<void>;

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
  onBrowserOpenInTab: (callback: (data: { url: string; newTab: boolean }) => void) => () => void;

  // Terminal operations
  terminalCreate: (args: {
    sessionId: string;
    tabId: string;
    projectRoot: string;
    cwd: string;
    cols?: number;
    rows?: number;
  }) => Promise<{ shell: string; cwd: string; pid: number; tabId: string }>;
  terminalDestroy: (args: { sessionId: string }) => Promise<void>;
  terminalDestroyTab: (args: { tabId: string }) => Promise<void>;
  terminalDestroyTabs: (args: { tabIds: string[] }) => Promise<void>;
  terminalWrite: (args: { sessionId: string; data: string }) => Promise<void>;
  terminalResize: (args: { sessionId: string; cols: number; rows: number }) => Promise<void>;
  terminalEnvInfo: () => Promise<TerminalEnvInfo>;
  terminalLoadConfig: (projectRoot: string) => Promise<TerminalConfig>;
  terminalSaveConfig: (projectRoot: string, config: TerminalConfig) => Promise<void>;
  terminalRegisterBashJob: (args: {
    sessionId: string;
    toolCallId: string;
    command: string;
  }) => Promise<void>;
  terminalDestroyAllAiPty: () => Promise<void>;

  executionGet: (executionId: string) => Promise<import("@shared/execution").ExecutionGetResult>;
  executionFindByToolCallId: (
    toolCallId: string,
  ) => Promise<import("@shared/execution").ExecutionFindByToolCallIdResult>;
  executionReplay: (
    args: import("@shared/execution").ExecutionReplayArgs,
  ) => Promise<import("@shared/execution").ExecutionReplayResult>;
  executionCancel: (executionId: string) => Promise<import("@shared/execution").ExecutionCancelResult>;
  executionRerun: (executionId: string) => Promise<import("@shared/execution").ExecutionRerunResult>;
  executionListRunning: () => Promise<import("@shared/execution").ExecutionListRunningResult>;
  executionApplyProjectSwitch: (
    args: import("@shared/execution").ExecutionApplyProjectSwitchArgs,
  ) => Promise<import("@shared/execution").ExecutionApplyProjectSwitchResult>;
  onExecutionEvent: (
    listener: (event: import("@shared/execution").TerminalExecutionEvent) => void,
  ) => () => void;

  // Terminal events (Main → Renderer)
  onTerminalData: (callback: (data: { sessionId: string; tabId: string; data: string }) => void) => () => void;
  onTerminalExit: (callback: (data: { sessionId: string; tabId: string; exitCode: number }) => void) => () => void;

  // Git operations
  gitWarmup: (projectRoot: string) => Promise<{ ok: boolean }>;
  logFetch: (params: import("@shared/platform/log-types").LogFetchParams) => Promise<import("@shared/platform/log-types").LogFetchResult>;
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
  gitLog: (
    projectRoot: string,
    maxCountOrOpts?: number | { maxCount?: number; range?: "head" | "branch"; baseBranch?: string },
  ) => Promise<Array<{ hash: string; message: string; author: string; date: string; graph: string; refs: string; insertions: number; deletions: number }>>;
  gitDiscard: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) => Promise<GitResultData>;
  gitPush: (projectRoot: string, remote?: string) => Promise<GitPushResultData>;
  gitRemotes: (projectRoot: string) => Promise<GitRemoteInfo[]>;
  gitAddRemote: (projectRoot: string, name: string, url: string) => Promise<GitAddRemoteResultData>;
  gitFetch: (
    projectRoot: string,
    opts?: { remote?: string; all?: boolean },
  ) => Promise<GitSyncResultData>;
  gitPull: (projectRoot: string) => Promise<GitSyncResultData>;
  gitMerge: (projectRoot: string, sourceBranch: string) => Promise<GitMergeResultData>;
  gitMergeNoCommit: (projectRoot: string, sourceBranch: string) => Promise<GitMergeResultData>;
  gitAbortMerge: (projectRoot: string) => Promise<GitResultData>;
  gitStash: (projectRoot: string, message?: string) => Promise<GitResultData>;
  gitStashPop: (projectRoot: string) => Promise<GitResultData>;
  gitCommitDiff: (projectRoot: string, hash: string) => Promise<string>;
  gitCommitFiles: (projectRoot: string, hash: string) => Promise<Array<{ path: string; added: number; deleted: number }>>; // hash or `base...HEAD`
  gitCommitFileDiff: (projectRoot: string, hash: string, filePath: string) => Promise<{ path: string; oldContent: string; newContent: string }>;
  gitCheckIgnore: (projectRoot: string, relativePaths: string[]) => Promise<string[]>;

  // Git hosting (gh CLI — GitHub PRs)
  gitHostingAuthStatus: (projectRoot: string) => Promise<GhAuthStatus>;
  gitHostingPrCreate: (input: GhPrCreateInput) => Promise<GhPrCreateResult>;
  gitHostingPrViewWeb: (projectRoot: string, url?: string) => Promise<GhPrViewWebResult>;

  // Theme — native glass (Electron 43 vibrancy / mica)
  themeApplyGlass: (payload: { enabled: boolean; opaqueBackground?: string }) => Promise<void>;
  themeListSystemFonts: () => Promise<{ family: string; monospace: boolean }[]>;

  // Worktree operations
  worktreeList: (projectRoot: string) => Promise<WorktreeInfo[]>;
  worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) => Promise<WorktreeInfo>;
  worktreeRemove: (projectRoot: string, name: string) => Promise<void>;
  worktreeMergeStatus: (projectRoot: string, name: string) => Promise<MergeStatus>;
  worktreeMoveSessions: (projectRoot: string, worktreeName: string) => Promise<number>;
  worktreeBranches: (projectRoot: string) => Promise<BranchInfo[]>;

  // Remote workspace — hosts come from ~/.ssh/config
  remoteListHosts: () => Promise<import("@shared/remote").SshConfigHost[]>;
  remoteTrustHost: (input: { host: string; port: number; fingerprint: string }) => Promise<void>;
  remoteConnect: (profileId: string) => Promise<import("@shared/remote").RemoteConnectResult>;
  remoteDisconnect: (profileId: string) => Promise<void>;
  remoteConnectionStatus: (
    profileId?: string,
  ) => Promise<import("@shared/remote").RemoteConnectionState | import("@shared/remote").RemoteConnectionSnapshot>;
  remoteListDir: (input: {
    profileId: string;
    path: string;
  }) => Promise<import("@shared/remote").RemoteDirListing>;
  remoteMkdir: (input: {
    profileId: string;
    path: string;
  }) => Promise<{ ok: true; path: string }>;
  remoteOpenProject: (input: {
    profileId: string;
    remoteRoot: string;
  }) => Promise<{
    projectId: string;
    remoteRoot: string;
    connectionId: string;
    lastPath: string;
    handle: import("@shared/remote").RemoteProjectHandle;
  }>;
  onRemoteLog: (callback: (line: import("@shared/remote").RemoteBootstrapLogLine) => void) => () => void;
  remoteZoteroCancel: () => Promise<{ ok: boolean }>;
  onRemoteZoteroProgress: (
    callback: (progress: { current: number; total: number; title: string }) => void,
  ) => () => void;
  onRemoteConnection: (
    callback: (payload: {
      profileId: string;
      state: import("@shared/remote").RemoteConnectionState;
    }) => void,
  ) => () => void;
  remoteGetSyncMode: (profileId: string) => Promise<{ mode: import("@shared/remote").RemoteSyncMode }>;
  remoteSetSyncMode: (
    profileId: string,
    mode: import("@shared/remote").RemoteSyncMode,
  ) => Promise<{ mode: import("@shared/remote").RemoteSyncMode }>;
  remoteSyncFile: (input: {
    profileId: string;
    projectId: string;
    remoteAbs: string;
    destRel?: string;
  }) => Promise<{ ok: true; path: string; skipped?: string } | { ok: false; error: string }>;
  remoteSyncPaperPdf: (input: {
    projectRoot: string;
    paperId: string;
    projectId: string;
  }) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  remoteSyncExperimentArtifacts: (input: {
    projectRoot: string;
    projectId: string;
    experimentId: string;
  }) => Promise<{ ok: true; paths: string[]; skipped: number }>;
  remoteSyncSessions: (input: {
    profileId: string;
    projectId: string;
  }) => Promise<{ ok: true; count: number }>;
  remoteSyncCancel: () => Promise<{ ok: boolean }>;
  remotePushSkills: (profileId: string) => Promise<{ ok: true; files: number } | { ok: false; error: string }>;
  onRemoteSyncProgress: (
    callback: (progress: import("@shared/remote").RemoteSyncProgress) => void,
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
