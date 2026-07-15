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

/** Result of comparing the installed version against the manifest. */
export type UpdateCheckResult =
  | { status: "up-to-date"; currentVersion: string }
  | { status: "available"; currentVersion: string; latest: UpdateVersionInfo }
  | { status: "ignored"; currentVersion: string; latest: UpdateVersionInfo }
  | { status: "error"; currentVersion: string; error: string }
  | { status: "no-source"; currentVersion: string };

export interface CompilerStatus {
  texlive: TexliveStatus;
  tectonic: boolean;
}

export interface SynctexResult {
  file: string;
  line: number;
  column: number;
}

export interface SynctexForwardResult {
  page: number;
  x: number;
  y: number;
  height: number;
  width: number;
}

export interface SynctexForwardResult {
  page: number;
  x: number;
  y: number;
  height: number;
  width: number;
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
  fsRead: (absPath: string) => Promise<{ content: string }>;
  fsReadBatch: (absPaths: string[]) => Promise<{ results: Record<string, string> }>;
  fsReadImage: (absPath: string) => Promise<{ dataUrl: string }>;
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
  /** Absolute path for a File from an OS drag-drop (Electron webUtils). */
  getPathForFile: (file: File) => string;
  fsExists: (absPath: string) => Promise<boolean>;
  fsIsFile: (absPath: string) => Promise<boolean>;
  projectCreate: (rootPath: string, workspaceDirs?: import("./workspace").WorkspaceFolder[]) => Promise<void>;
  /** Fetch the update manifest and compare against the installed version. */
  updateCheck: () => Promise<UpdateCheckResult>;
  /** Last check result without re-hitting the network. */
  updateStatus: () => Promise<UpdateCheckResult | null>;
  /** Suppress a version from surfacing as an update. Returns the new status. */
  updateIgnore: (version: string) => Promise<UpdateCheckResult | null>;
  /** Clear the ignored-version flag. Returns the new status. */
  updateUnignore: () => Promise<UpdateCheckResult | null>;
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

  // Experiments (Sprint 0.7 — Experiments RightArea mode)
  experimentList: (projectRoot: string) => Promise<
    | {
        ok: true;
        experimentRoot: string;
        registryRoot: string;
        experiments: import("../../shared/experiment-log").ExperimentSummary[];
      }
    | { ok: false; error: string; hint?: string }
  >;
  experimentRead: (args: { projectRoot: string; id: string; runsLimit?: number }) => Promise<
    | {
        ok: true;
        meta: import("../../shared/experiment-log").ExperimentMeta;
        runs: import("../../shared/experiment-log").ExperimentRunEntry[];
        experimentRoot: string;
        registryRoot: string;
      }
    | { ok: false; error: string; hint?: string }
  >;
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
    chatSessionId?: string | null;
  }) => Promise<
    | { ok: true; runId: string; status: "started" }
    | { ok: false; error: string; hint?: string }
  >;
  experimentCancelRun: (args: { projectRoot: string; id: string; runId: string }) => Promise<{ ok: true }>;
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
    callback: (data: {
      id: string;
      runId: string;
      result: {
        ok: boolean;
        run?: import("../../shared/experiment-log").ExperimentRunEntry;
        exitCode?: number;
        stdoutTail?: string;
        stderrTail?: string;
        error?: string;
      };
    }) => void,
  ) => () => void;
  onExperimentRunOutput: (
    callback: (data: { id: string; runId: string; chunk: string }) => void,
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
  ) => Promise<{ pdfBytes: ArrayBuffer; buildDir?: string; stdout?: string } | { error: string; stdout?: string }>;
  compileSynctex: (
    projectDir: string,
    page: number,
    x: number,
    y: number,
  ) => Promise<SynctexResult | null>;
  compileSynctexForward: (
    projectDir: string,
    file: string,
    line: number,
  ) => Promise<SynctexForwardResult | null>;
  compileDetectTexlive: () => Promise<CompilerStatus>;
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
  ) => Promise<{
    paper: LiteraturePaper;
    created: boolean;
    duplicateReason?: "doi" | "arxiv";
    pdfAttached?: boolean;
    pdfAttachError?: string;
  }>;
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
      discoveredFrom?: "paper-search-mcp" | "websearch" | "webfetch" | "user" | "agent";
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
      discoveredFrom: "paper-search-mcp" | "websearch" | "webfetch" | "user" | "agent";
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
  chatPrewarm: (projectPath: string) => Promise<{ sessionId: string | null }>;
  mcpEnsure: (projectPath: string) => Promise<{
    ok: boolean;
    health: {
      status: "ready" | "degraded";
      mode: "npx";
      detail: string;
    };
  }>;
  mcpApply: (projectPath: string) => Promise<{
    ok: boolean;
    reloadedSessions: number;
    error?: string;
    health?: {
      status: "ready" | "degraded";
      mode: "npx";
      detail: string;
    };
  }>;
  mcpPaperSearchHealth: () => Promise<{
    status: "ready" | "degraded";
    mode: "npx";
    detail: string;
  }>;
  agentListSkills: (projectPath: string) => Promise<Array<{
    id: string;
    name: string;
    description: string;
    skillDirRel: string;
    enabled: boolean;
    installOrigin?:
      | { adapter: "github"; repo: string; ref: string; path: string }
      | { adapter: "discovery"; indexUrl: string };
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
      id: string;
      name: string;
      description: string;
      skillDirRel: string;
      enabled: boolean;
      installOrigin?:
        | { adapter: "github"; repo: string; ref: string; path: string }
        | { adapter: "discovery"; indexUrl: string };
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
  expertsGetManifest: (projectPath: string) => Promise<import("@shared/agent-experts").ExpertsManifest>;
  orchestratorsGetManifest: (projectPath: string) => Promise<import("@shared/agent-experts").OrchestratorsManifest>;
  expertsGetDetail: (
    projectPath: string,
    expertId: string,
  ) => Promise<(import("@shared/agent-experts").ExpertInfo & { instructions: string }) | null>;
  expertsSetBuiltinEnabled: (
    projectPath: string,
    expertId: string,
    enabled: boolean,
  ) => Promise<{ manifest: import("@shared/agent-experts").ExpertsManifest; experts: import("@shared/agent-experts").ExpertInfo[] }>;
  expertsSaveCustom: (
    projectPath: string,
    payload: import("@shared/agent-experts").SaveCustomExpertPayload,
  ) => Promise<{ expert: import("@shared/agent-experts").ExpertInfo; experts: import("@shared/agent-experts").ExpertInfo[] }>;
  expertsSaveBuiltinOverride: (
    projectPath: string,
    payload: import("@shared/agent-experts").SaveBuiltinExpertOverridePayload,
  ) => Promise<{ expert: import("@shared/agent-experts").ExpertInfo; experts: import("@shared/agent-experts").ExpertInfo[] }>;
  expertsDeleteCustom: (
    projectPath: string,
    expertId: string,
  ) => Promise<{ experts: import("@shared/agent-experts").ExpertInfo[] }>;
  orchestratorsSetDefault: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<{
    manifest: import("@shared/agent-experts").OrchestratorsManifest;
    orchestrators: import("@shared/agent-experts").OrchestratorInfo[];
  }>;
  orchestratorsSaveBuiltinOverride: (
    projectPath: string,
    payload: import("@shared/agent-experts").SaveBuiltinOrchestratorOverridePayload,
  ) => Promise<{
    orchestrator: import("@shared/agent-experts").OrchestratorInfo;
    orchestrators: import("@shared/agent-experts").OrchestratorInfo[];
  }>;
  orchestratorsResetBuiltinOverride: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<{
    orchestrator: import("@shared/agent-experts").OrchestratorInfo;
    orchestrators: import("@shared/agent-experts").OrchestratorInfo[];
  }>;
  orchestratorsGetDetail: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<(import("@shared/agent-experts").OrchestratorInfo & { instructions: string }) | null>;
  orchestratorsSaveCustom: (
    projectPath: string,
    payload: import("@shared/agent-experts").SaveCustomOrchestratorPayload,
  ) => Promise<{
    orchestrator: import("@shared/agent-experts").OrchestratorInfo;
    orchestrators: import("@shared/agent-experts").OrchestratorInfo[];
  }>;
  orchestratorsDeleteCustom: (
    projectPath: string,
    orchestratorId: string,
  ) => Promise<{ orchestrators: import("@shared/agent-experts").OrchestratorInfo[] }>;
  expertsGetEditorOptions: (projectPath: string) => Promise<import("@shared/agent-editor-options").AgentEditorOptions>;
  expertsResetBuiltinOverride: (
    projectPath: string,
    expertId: string,
  ) => Promise<{ expert: import("@shared/agent-experts").ExpertInfo; experts: import("@shared/agent-experts").ExpertInfo[] }>;
  expertsResetBuiltinsToDefaults: (
    projectPath: string,
  ) => Promise<{ manifest: import("@shared/agent-experts").ExpertsManifest; experts: import("@shared/agent-experts").ExpertInfo[] }>;
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
    selectedExpertIds?: string[];
  }) => Promise<void>;
  chatCancel: (sessionId: string) => Promise<void>;
  chatRegisterTab: (args: { tabId: string; sessionId: string; projectPath?: string }) => Promise<{ success: boolean }>;
  chatSyncIntensiveReading: (args: {
    sessionId: string;
    projectRoot: string;
    paperIds?: string[];
  }) => Promise<{ success: boolean }>;
  chatCompact: (sessionId: string, projectPath: string) => Promise<void>;
  chatAnswer: (sessionId: string, answer: string) => Promise<void>;
  chatAnswerQuestion: (questionId: string, answer: string) => Promise<{ success: boolean; error?: string }>;
  chatAnswerPermission: (permissionId: string, approved: boolean, toolCallId?: string) => Promise<void>;
  chatStatus: () => Promise<{ available: boolean; version: string }>;
  sessionList: (projectPath?: string) => Promise<Array<{ id: string; title: string; lastModified: number; createdAt: number; directory?: string }>>;
  sessionLoad: (sessionId: string, projectPath?: string, cwd?: string) => Promise<any[]>;
  sessionLoadWindow: (sessionId: string, projectPath: string | undefined, cwd: string | undefined, offset: number, limit: number) => Promise<{ messages: any[]; totalMessages: number }>;
  sessionGetDirectory: (sessionId: string) => Promise<string | null>;
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
  sessionGetContext: (projectPath: string, sessionId: string) => Promise<{ tokens: number; breakdown: Record<string, number>; schema: { key: string; label: string; color: string; description?: string; order?: number }[]; updatedAt: number; hasSystemPromptBlock?: boolean; promptFingerprint?: string } | null>;
  sessionGetUserDisplays: (projectPath: string, sessionId: string) => Promise<import("@/stores/chat-store").ContentBlock[][]>;
  sessionAppendUserDisplay: (
    projectPath: string,
    sessionId: string,
    content: import("@/stores/chat-store").ContentBlock[],
  ) => Promise<{ success: boolean }>;
  chatGetProviders: () => Promise<any[]>;
  chatSetAuth: (provider: string, credentials: Record<string, string>) => Promise<{ success: boolean }>;
  chatTestConnection(args: { provider: string; apiKey: string; baseUrl?: string }): Promise<{ success: boolean; models?: string[] }>;

  // Chat events (Main → Renderer)
  onChatStream: (callback: (data: { tabId: string; type: string; data: any }) => void) => () => void;
  onChatComplete: (callback: (data: { tabId: string; sessionId: string; success: boolean; error?: string; tokenUsage?: any; contextBreakdown?: Record<string, number> | null; categorySchema?: import("../../shared/constants").ContextCategoryDef[] | null; promptStale?: boolean }) => void) => () => void;
  onChatPermission: (callback: (data: { tabId: string; permissionId: string; message: string; options: any; toolCallId?: string; toolName?: string; raw?: any }) => void) => () => void;
  onChatSessionCreated: (callback: (data: { tabId: string; sessionId: string }) => void) => () => void;
  removeChatListeners: () => void;

  // File watcher events (Main → Renderer)
  onFileChanged: (callback: (data: { projectRoot: string; changedPaths?: string[] }) => void) => () => void;
  onSkillsIntegrationChanged: (callback: (data: { projectPath: string }) => void) => () => void;

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
  }>>;
  settingsGetModules: (projectRoot?: string) => Promise<Array<{
    key: string;
    label: string;
    description: string;
    source: string;
    autoGenerated?: boolean;
    profileOnly?: boolean;
    selectableInProfile: boolean;
    injectPath: string;
    contentPreview: string;
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
    sections: Array<{
      id: string;
      label: string;
      injectPath: string;
      fileHint?: string;
      charCount: number;
      content: string;
    }>;
  }>;
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
  commandsToggle: (id: string, enabled: boolean) => Promise<import("@commands/types").CommandDef[]>;
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

  // Theme — glass vibrancy synchronization
  themeSetGlassMode: (mode: "light" | "dark" | "system") => Promise<void>;

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
