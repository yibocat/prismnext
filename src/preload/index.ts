import { contextBridge, ipcRenderer } from "electron";
import type { WorkspaceFolder } from "../renderer/types/workspace";

// Expose filesystem and dialog APIs to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform as "darwin" | "win32" | "linux",

  // Filesystem operations
  fsScan: (rootPath: string) => ipcRenderer.invoke("fs:scan", { rootPath }),
  fsScanMetadata: (rootPath: string) => ipcRenderer.invoke("fs:scanMetadata", { rootPath }),
  fsRead: (absPath: string) => ipcRenderer.invoke("fs:read", { absPath }),
  fsReadBatch: (absPaths: string[]) => ipcRenderer.invoke("fs:readBatch", { absPaths }),
  fsReadImage: (absPath: string) =>
    ipcRenderer.invoke("fs:readImage", { absPath }),
  fsWrite: (absPath: string, content: string) =>
    ipcRenderer.invoke("fs:write", { absPath, content }),
  fsCreate: (rootPath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke("fs:create", { rootPath, relativePath, content }),
  fsDelete: (absPath: string) => ipcRenderer.invoke("fs:delete", { absPath }),
  fsDeleteFolder: (absPath: string) =>
    ipcRenderer.invoke("fs:deleteFolder", { absPath }),
  fsRename: (oldPath: string, newPath: string) =>
    ipcRenderer.invoke("fs:rename", { oldPath, newPath }),
  fsMkdir: (absPath: string) => ipcRenderer.invoke("fs:mkdir", { absPath }),

  // Template
  templateList: () => ipcRenderer.invoke("template:list"),
  templateGet: (templateId: string) => ipcRenderer.invoke("template:get", { templateId }),
  templatePreview: (templateId: string) => ipcRenderer.invoke("template:preview", { templateId }),
  templateApply: (args: {
    rootPath: string;
    manuscriptDir: string;
    files: { path: string; content: string }[];
    templateId: string;
    templateCategory: string;
  }) => ipcRenderer.invoke("template:apply", args),
  templateGetPdfData: (templateId: string) => ipcRenderer.invoke("template:getPdfData", { templateId }),
  templateDetectChanges: (args: {
    rootPath: string;
    manuscriptDir: string;
    appliedFiles: Record<string, string>;
  }) => ipcRenderer.invoke("template:detectChanges", args),
  templateBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    files: string[];
    backupLabel: string;
  }) => ipcRenderer.invoke("template:backup", args),
  templateListBackups: (args: { rootPath: string }) =>
    ipcRenderer.invoke("template:listBackups", args),
  templateRestoreBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    backupLabel: string;
  }) => ipcRenderer.invoke("template:restoreBackup", args),

  // File watcher
  fsWatchStart: (rootPath: string) =>
    ipcRenderer.invoke("fs:watch-start", { rootPath }),
  fsWatchStop: () => ipcRenderer.invoke("fs:watch-stop"),

  // Dialog operations
  dialogOpenFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  fsExists: (absPath: string) => ipcRenderer.invoke("fs:exists", { absPath }),
  projectCreate: (rootPath: string, workspaceDirs?: WorkspaceFolder[]) =>
    ipcRenderer.invoke("project:create", { rootPath, workspaceDirs }),
  projectCheck: (rootPath: string) => ipcRenderer.invoke("project:check", { rootPath }),

  // Window operations
  windowSetTitle: (title: string) =>
    ipcRenderer.invoke("window:setTitle", { title }),
  windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  windowIsFullscreen: () => ipcRenderer.invoke("window:isFullscreen"),
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),

  // Window state events (Main → Renderer)
  onWindowStateChange: (
    callback: (state: {
      isMaximized: boolean;
      isFullscreen: boolean;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: { isMaximized: boolean; isFullscreen: boolean },
    ) => callback(state);
    ipcRenderer.on("window:stateChange", handler);
    return () => ipcRenderer.removeListener("window:stateChange", handler);
  },

  // Compile operations
  compileExecute: (projectDir: string, mainFile: string, useTexlive?: boolean) =>
    ipcRenderer.invoke("compile:execute", { projectDir, mainFile, useTexlive }),
  compileSynctex: (projectDir: string, page: number, x: number, y: number) =>
    ipcRenderer.invoke("compile:synctex", { projectDir, page, x, y }),
  compileSynctexForward: (projectDir: string, file: string, line: number) =>
    ipcRenderer.invoke("compile:synctexForward", { projectDir, file, line }),
  compileDetectTexlive: () => ipcRenderer.invoke("compile:detectTexlive"),

  // CLI agent operations
  cliDispose: () => ipcRenderer.invoke("cli:dispose"),
  cliPrewarm: (projectPath: string, tabId?: string, worktreePath?: string, settings?: Record<string, string | null>) =>
    ipcRenderer.invoke("cli:prewarm", { projectPath, tabId, worktreePath, settings }),
  cliStatus: () => ipcRenderer.invoke("cli:status"),
  cliSend: (args: { projectPath: string; worktreePath?: string; prompt: string; tabId?: string; agent?: string; sessionId?: string | null; settings?: Record<string, string | null> }) =>
    ipcRenderer.invoke("cli:send", args),
  cliSetGateway: (baseUrl?: string, apiKey?: string) =>
    ipcRenderer.invoke("cli:setGateway", { baseUrl, apiKey }),
  cliCancel: (tabId?: string) =>
    ipcRenderer.invoke("cli:cancel", { tabId }),
  cliCloseSession: (tabId?: string) =>
    ipcRenderer.invoke("cli:closeSession", { tabId }),
  cliAnswer: (tabId: string, answer: string) =>
    ipcRenderer.invoke("cli:answer", { tabId, answer }),
  cliListSessions: (projectPath: string, worktreePath?: string) =>
    ipcRenderer.invoke("cli:listSessions", { projectPath, worktreePath }),
  cliLoadSession: (projectPath: string, sessionId: string, agentId?: string, worktreePath?: string) =>
    ipcRenderer.invoke("cli:loadSession", { projectPath, sessionId, agentId, worktreePath }),
  cliDeleteSession: (projectPath: string, sessionId: string, agentId?: string, worktreePath?: string) =>
    ipcRenderer.invoke("cli:deleteSession", { projectPath, sessionId, agentId, worktreePath }),

  // Settings operations
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:set", patch),
  settingsGetAgentProjectConfig: (projectPath: string) =>
    ipcRenderer.invoke("settings:getAgentProjectConfig", { projectPath }),
  settingsSetAgentProjectConfig: (projectPath: string, config: any) =>
    ipcRenderer.invoke("settings:setAgentProjectConfig", { projectPath, config }),
  settingsGetDefaultAgentPrompt: () =>
    ipcRenderer.invoke("settings:getDefaultAgentPrompt"),

  // Workspace operations
  workspaceGetConfig: (projectRoot: string) =>
    ipcRenderer.invoke("workspace:getConfig", { projectRoot }),
  workspaceUpdateConfig: (projectRoot: string, dirs: WorkspaceFolder[]) =>
    ipcRenderer.invoke("workspace:updateConfig", { projectRoot, dirs }),
  workspaceCreateFolders: (projectRoot: string, dirs?: WorkspaceFolder[]) =>
    ipcRenderer.invoke("workspace:createFolders", { projectRoot, dirs }),
  workspaceEnsureMainTex: (projectRoot: string) =>
    ipcRenderer.invoke("workspace:ensureMainTex", { projectRoot }) as Promise<{ created: boolean; relativePath?: string }>,

  // Browser operations
  browserInit: (projectRoot: string) => ipcRenderer.invoke("browser:init", { projectRoot }),
  browserSaveBookmarks: (projectRoot: string, bookmarks: unknown[]) =>
    ipcRenderer.invoke("browser:saveBookmarks", { projectRoot, bookmarks }),
  browserSaveRecent: (projectRoot: string, recent: unknown[]) =>
    ipcRenderer.invoke("browser:saveRecent", { projectRoot, recent }),
  browserClearCookies: () => ipcRenderer.invoke("browser:clearCookies"),
  browserClearCache: () => ipcRenderer.invoke("browser:clearCache"),

  // Terminal operations
  terminalCreate: (args: { sessionId: string; projectRoot: string }) =>
    ipcRenderer.invoke("terminal:create", args),
  terminalDestroy: (args: { sessionId: string }) =>
    ipcRenderer.invoke("terminal:destroy", args),
  terminalDestroyTab: (args: { tabId: string }) =>
    ipcRenderer.invoke("terminal:destroyTab", args),
  terminalWrite: (args: { sessionId: string; data: string }) =>
    ipcRenderer.invoke("terminal:write", args),
  terminalResize: (args: { sessionId: string; cols: number; rows: number }) =>
    ipcRenderer.invoke("terminal:resize", args),
  terminalEnvInfo: () => ipcRenderer.invoke("terminal:envInfo"),
  terminalLoadConfig: (projectRoot: string) =>
    ipcRenderer.invoke("terminal:loadConfig", { projectRoot }),
  terminalSaveConfig: (projectRoot: string, config: unknown) =>
    ipcRenderer.invoke("terminal:saveConfig", { projectRoot, config }),

  // Terminal events (Main → Renderer)
  onTerminalData: (callback: (data: { sessionId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; data: string }) => callback(data);
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },
  onTerminalExit: (callback: (data: { sessionId: string; exitCode: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; exitCode: number }) => callback(data);
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },

  // Git operations
  gitWarmup: (projectRoot: string) =>
    ipcRenderer.invoke("git:warmup", { projectRoot }),
  gitIsRepo: (projectRoot: string) =>
    ipcRenderer.invoke("git:isRepo", { projectRoot }),
  gitStatus: (projectRoot: string) =>
    ipcRenderer.invoke("git:status", { projectRoot }),
  gitBranches: (projectRoot: string) =>
    ipcRenderer.invoke("git:branches", { projectRoot }),
  gitCheckout: (projectRoot: string, branch: string) =>
    ipcRenderer.invoke("git:checkout", { projectRoot, branch }),
  gitCreateBranch: (projectRoot: string, branchName: string) =>
    ipcRenderer.invoke("git:createBranch", { projectRoot, branchName }),
  gitDiff: (projectRoot: string, filePath: string, indexStatus: string, worktreeStatus: string, staged: boolean, unstaged: boolean, untracked: boolean, view?: "staged" | "unstaged" | "all") =>
    ipcRenderer.invoke("git:diff", { projectRoot, filePath, indexStatus, worktreeStatus, staged, unstaged, untracked, view }),
  gitStage: (projectRoot: string, filePath: string) =>
    ipcRenderer.invoke("git:stage", { projectRoot, filePath }),
  gitUnstage: (projectRoot: string, filePath: string) =>
    ipcRenderer.invoke("git:unstage", { projectRoot, filePath }),
  gitStageAll: (projectRoot: string, filePaths: string[]) =>
    ipcRenderer.invoke("git:stageAll", { projectRoot, filePaths }),
  gitUnstageAll: (projectRoot: string, filePaths: string[]) =>
    ipcRenderer.invoke("git:unstageAll", { projectRoot, filePaths }),
  gitInit: (projectRoot: string) =>
    ipcRenderer.invoke("git:init", { projectRoot }),
  gitDiscard: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) =>
    ipcRenderer.invoke("git:discard", { projectRoot, filePath, staged, untracked, worktreeStatus }),
  gitCommit: (projectRoot: string, message: string) =>
    ipcRenderer.invoke("git:commit", { projectRoot, message }),
  gitCommitAll: (projectRoot: string, filePaths: string[], message: string) =>
    ipcRenderer.invoke("git:commitAll", { projectRoot, filePaths, message }),
  gitDeleteBranch:(projectRoot: string, branch: string) =>
    ipcRenderer.invoke("git:deleteBranch", { projectRoot, branch }),
  gitRevert: (projectRoot: string, hash: string) =>
    ipcRenderer.invoke("git:revert", { projectRoot, hash }),
  gitReset: (projectRoot: string, hash: string, mode: "soft" | "mixed" | "hard") =>
    ipcRenderer.invoke("git:reset", { projectRoot, hash, mode }),
  gitDiffStats: (projectRoot: string) =>
    ipcRenderer.invoke("git:diffStats", { projectRoot }),
  gitLog: (projectRoot: string, maxCount?: number) =>
    ipcRenderer.invoke("git:log", { projectRoot, maxCount }),
  gitMerge: (projectRoot: string, sourceBranch: string) =>
    ipcRenderer.invoke("git:merge", { projectRoot, sourceBranch }),
  gitMergeNoCommit: (projectRoot: string, sourceBranch: string) =>
    ipcRenderer.invoke("git:mergeNoCommit", { projectRoot, sourceBranch }),
  gitAbortMerge: (projectRoot: string) =>
    ipcRenderer.invoke("git:abortMerge", { projectRoot }),
  gitStash: (projectRoot: string, message?: string) =>
    ipcRenderer.invoke("git:stash", { projectRoot, message }),
  gitStashPop: (projectRoot: string) =>
    ipcRenderer.invoke("git:stashPop", { projectRoot }),
  gitCommitDiff: (projectRoot: string, hash: string) =>
    ipcRenderer.invoke("git:commitDiff", { projectRoot, hash }),
  gitCommitFiles: (projectRoot: string, hash: string) =>
    ipcRenderer.invoke("git:commitFiles", { projectRoot, hash }),
  gitCommitFileDiff: (projectRoot: string, hash: string, filePath: string) =>
    ipcRenderer.invoke("git:commitFileDiff", { projectRoot, hash, filePath }),

  // Worktree operations
  worktreeList: (projectRoot: string) =>
    ipcRenderer.invoke("worktree:list", { projectRoot }),
  worktreeCreate: (projectRoot: string, name?: string, baseBranch?: string) =>
    ipcRenderer.invoke("worktree:create", { projectRoot, name, baseBranch }),
  worktreeBranches: (projectRoot: string) =>
    ipcRenderer.invoke("worktree:branches", { projectRoot }),
  worktreeRemove: (projectRoot: string, name: string) =>
    ipcRenderer.invoke("worktree:remove", { projectRoot, name }),
  worktreeMergeStatus: (projectRoot: string, name: string) =>
    ipcRenderer.invoke("worktree:mergeStatus", { projectRoot, name }),
  worktreeMoveSessions: (projectRoot: string, worktreeName: string) =>
    ipcRenderer.invoke("worktree:moveSessions", { projectRoot, worktreeName }),

  // CLI agent events (Main → Renderer)
  onCliStream: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("cli:stream", handler);
    return () => ipcRenderer.removeListener("cli:stream", handler);
  },
  onCliComplete: (callback: (data: { tabId: string; success: boolean; stopReason?: string; error?: string; inputTokens?: number | null }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; success: boolean; stopReason?: string; error?: string; inputTokens?: number | null }) => callback(data);
    ipcRenderer.on("cli:complete", handler);
    return () => ipcRenderer.removeListener("cli:complete", handler);
  },
  onCliStderr: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("cli:stderr", handler);
    return () => ipcRenderer.removeListener("cli:stderr", handler);
  },
  onCliSessionCreated: (callback: (data: { tabId: string; sessionId: string; agentId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; sessionId: string; agentId: string }) => callback(data);
    ipcRenderer.on("cli:sessionCreated", handler);
    return () => ipcRenderer.removeListener("cli:sessionCreated", handler);
  },
  removeCliListeners: () => {
    ipcRenderer.removeAllListeners("cli:stream");
    ipcRenderer.removeAllListeners("cli:complete");
    ipcRenderer.removeAllListeners("cli:stderr");
  },

  // File watcher events (Main → Renderer)
  onFileChanged: (callback: (data: { projectRoot: string; changedPaths?: string[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { projectRoot: string; changedPaths?: string[] }) => callback(data);
    ipcRenderer.on("fs:fileChanged", handler);
    return () => ipcRenderer.removeListener("fs:fileChanged", handler);
  },

  // Log system
  logFetch: (params: unknown) => ipcRenderer.invoke("log:fetch", params),

  // Theme — glass vibrancy synchronization
  themeSetGlassMode: (mode: "light" | "dark" | "system") =>
    ipcRenderer.invoke("theme:setGlassMode", mode),
});
