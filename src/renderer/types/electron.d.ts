export interface TexliveStatus {
  available: boolean;
  engines: string[];
  version: string | null;
}

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
  }) => Promise<{ backupPath: string }>;
  templateListBackups: (args: { rootPath: string }) => Promise<
    { label: string; timestamp: string; files: string[] }[]
  >;
  templateRestoreBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    backupLabel: string;
  }) => Promise<{ restored: string[] }>;

  // File watcher operations
  fsWatchStart: (rootPath: string) => Promise<void>;
  fsWatchStop: () => Promise<void>;

  // Dialog operations
  dialogOpenFolder: () => Promise<{
    canceled: boolean;
    path: string | null;
  }>;
  fsExists: (absPath: string) => Promise<boolean>;
  projectCreate: (rootPath: string, workspaceDirs?: import("./workspace").WorkspaceFolder[]) => Promise<void>;
  projectEnsure: (rootPath: string) => Promise<{ success: boolean }>;
  projectScaffoldAgentsMd: (rootPath: string) => Promise<{
    agentsMdPath: string;
    content: string;
    digestMarkdown: string;
    updated: boolean;
    stats: { dirsListed: number; filesListed: number };
  }>;
  projectCheck: (rootPath: string) => Promise<{ missing: string[] }>;

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

  // OpenCode chat operations
  chatDispose: () => Promise<{ success: boolean }>;
  chatPrewarm: (projectPath: string) => Promise<{ sessionId: string | null }>;
  agentListSkills: (projectPath: string) => Promise<Array<{
    id: string;
    name: string;
    description: string;
    skillDirRel: string;
    enabled: boolean;
  }>>;
  agentListSkillRegistries: (projectPath: string) => Promise<string[]>;
  agentListSkillLibrarySources: (projectPath: string) => Promise<Array<{
    id: string;
    kind: "bundled" | "remote";
    url?: string;
    connected: boolean;
    name: string;
    description: string;
    removable: boolean;
  }>>;
  agentAddSkillLibrarySource: (projectPath: string, registryUrl: string) => Promise<{
    sources: Array<{
      id: string;
      kind: "bundled" | "remote";
      url?: string;
      connected: boolean;
      name: string;
      description: string;
      removable: boolean;
    }>;
    indexUrl: string;
  }>;
  agentRemoveSkillLibrarySource: (projectPath: string, sourceId: string) => Promise<{
    sources: Array<{
      id: string;
      kind: "bundled" | "remote";
      url?: string;
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
      kind: "bundled" | "remote";
      url?: string;
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
    }>;
  }>;
  agentConnectSkillRegistry: (projectPath: string, registryUrl: string) => Promise<{ registryUrls: string[]; indexUrl: string }>;
  agentDisconnectSkillRegistry: (projectPath: string, registryUrl: string) => Promise<{ registryUrls: string[] }>;
  agentSetSkillEnabled: (projectPath: string, skillId: string, enabled: boolean) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentInstallSkill: (projectPath: string, skillId: string, content: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentInstallSkillFromRegistry: (projectPath: string, skillName: string, artifactUrl: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  agentDeleteSkill: (projectPath: string, skillId: string) => Promise<{ skillsCount: number; configPath: string; registryUrls: string[] }>;
  chatSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; sessionId?: string | null; apiKey?: string; baseUrl?: string; model?: string; provider?: string; thoughtLevel?: string }) => Promise<void>;
  chatCancel: (sessionId: string) => Promise<void>;
  chatCompact: (sessionId: string, projectPath: string) => Promise<void>;
  chatAnswer: (sessionId: string, answer: string) => Promise<void>;
  chatAnswerQuestion: (questionId: string, answer: string) => Promise<{ success: boolean; error?: string }>;
  chatAnswerPermission: (permissionId: string, approved: boolean) => Promise<void>;
  chatStatus: () => Promise<{ available: boolean; version: string }>;
  sessionList: (projectPath?: string) => Promise<Array<{ id: string; title: string; lastModified: number; createdAt: number }>>;
  sessionLoad: (sessionId: string, projectPath?: string) => Promise<any[]>;
  sessionDelete: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
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
    pdfDarkMode?: "off" | "on" | "follow";
    autoCreateMainTex?: boolean;
    defaultDocClass?: "article" | "report" | "book";
    agentSystemPrompt?: string;
    editorSyntaxTheme?: string;
    defaultWorkspaceDirs?: import("./workspace").WorkspaceFolder[];
  }>;
  settingsSet: (patch: Record<string, unknown>) => Promise<void>;
  settingsGetModules: () => Promise<Array<{ key: string; label: string; description: string; enabled: boolean; source: string }>>;
  settingsSetModule: (key: string, enabled: boolean) => Promise<void>;
  settingsGetLayers: () => Promise<Array<{ id: string; priority: number; source: string; userToggleable: boolean; enabled: boolean }>>;
  settingsSetLayer: (id: string, enabled: boolean) => Promise<void>;
  settingsGetAgentProjectConfig: (projectPath: string) => Promise<{ contextComponents: Record<string, boolean> }>;
  settingsSetAgentProjectConfig: (projectPath: string, config: { contextComponents: Record<string, boolean> }) => Promise<void>;
  settingsGetAssembledPrompt: (projectRoot?: string, userCustomPrompt?: string) => Promise<string>;
  settingsComputePromptFingerprint: (projectRoot?: string) => Promise<string>;
  settingsGetDefaultPersona: () => Promise<string>;

  // Commands operations
  commandsList: () => Promise<import("@commands/types").CommandDef[]>;
  commandsExpand: (name: string, rawInput: string, projectRoot: string) => Promise<string>;
  commandsCreate: (payload: import("@commands/types").CreateCommandPayload) => Promise<import("@commands/types").CommandDef>;
  commandsUpdate: (id: string, payload: import("@commands/types").UpdateCommandPayload) => Promise<import("@commands/types").CommandDef>;
  commandsDelete: (id: string) => Promise<void>;
  commandsToggle: (id: string, enabled: boolean) => Promise<import("@commands/types").CommandDef[]>;
  commandsReload: () => Promise<import("@commands/types").CommandDef[]>;

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
  terminalCreate: (args: { sessionId: string; projectRoot: string }) => Promise<{ shell: string; cwd: string; pid: number }>;
  terminalDestroy: (args: { sessionId: string }) => Promise<void>;
  terminalDestroyTab: (args: { tabId: string }) => Promise<void>;
  terminalWrite: (args: { sessionId: string; data: string }) => Promise<void>;
  terminalResize: (args: { sessionId: string; cols: number; rows: number }) => Promise<void>;
  terminalEnvInfo: () => Promise<TerminalEnvInfo>;
  terminalLoadConfig: (projectRoot: string) => Promise<TerminalConfig>;
  terminalSaveConfig: (projectRoot: string, config: TerminalConfig) => Promise<void>;

  // Terminal events (Main → Renderer)
  onTerminalData: (callback: (data: { sessionId: string; data: string }) => void) => () => void;
  onTerminalExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => () => void;

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
