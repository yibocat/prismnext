import { contextBridge, ipcRenderer } from "electron";

// Expose filesystem and dialog APIs to renderer
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform as "darwin" | "win32" | "linux",

  // Filesystem operations
  fsScan: (rootPath: string) => ipcRenderer.invoke("fs:scan", { rootPath }),
  fsRead: (absPath: string) => ipcRenderer.invoke("fs:read", { absPath }),
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

  // File watcher
  fsWatchStart: (rootPath: string) =>
    ipcRenderer.invoke("fs:watch-start", { rootPath }),
  fsWatchStop: () => ipcRenderer.invoke("fs:watch-stop"),

  // Dialog operations
  dialogOpenFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  fsExists: (absPath: string) => ipcRenderer.invoke("fs:exists", { absPath }),
  projectCreate: (rootPath: string) => ipcRenderer.invoke("project:create", { rootPath }),
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
  compileDetectTexlive: () => ipcRenderer.invoke("compile:detectTexlive"),

  // CLI agent operations
  cliDispose: () => ipcRenderer.invoke("cli:dispose"),
  cliPrewarm: (projectPath: string, tabId?: string) =>
    ipcRenderer.invoke("cli:prewarm", { projectPath, tabId }),
  cliStatus: () => ipcRenderer.invoke("cli:status"),
  cliSend: (args: { projectPath: string; prompt: string; tabId?: string; agent?: string; model?: string | null; sessionId?: string | null }) =>
    ipcRenderer.invoke("cli:send", args),
  cliSetGateway: (baseUrl?: string, apiKey?: string) =>
    ipcRenderer.invoke("cli:setGateway", { baseUrl, apiKey }),
  cliCancel: (tabId?: string) =>
    ipcRenderer.invoke("cli:cancel", { tabId }),
  cliCloseSession: (tabId?: string) =>
    ipcRenderer.invoke("cli:closeSession", { tabId }),
  cliAnswer: (tabId: string, answer: string) =>
    ipcRenderer.invoke("cli:answer", { tabId, answer }),
  cliListSessions: (projectPath: string) =>
    ipcRenderer.invoke("cli:listSessions", { projectPath }),
  cliLoadSession: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("cli:loadSession", { projectPath, sessionId }),
  cliDeleteSession: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("cli:deleteSession", { projectPath, sessionId }),

  // Settings operations
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:set", patch),

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
  gitInit: (projectRoot: string) =>
    ipcRenderer.invoke("git:init", { projectRoot }),
  gitDiscard: (projectRoot: string, filePath: string, staged: boolean, untracked: boolean, worktreeStatus: string) =>
    ipcRenderer.invoke("git:discard", { projectRoot, filePath, staged, untracked, worktreeStatus }),
  gitCommit: (projectRoot: string, message: string) =>
    ipcRenderer.invoke("git:commit", { projectRoot, message }),
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
  gitAbortMerge: (projectRoot: string) =>
    ipcRenderer.invoke("git:abortMerge", { projectRoot }),
  gitCommitDiff: (projectRoot: string, hash: string) =>
    ipcRenderer.invoke("git:commitDiff", { projectRoot, hash }),
  gitCommitFileDiff: (projectRoot: string, hash: string, filePath: string) =>
    ipcRenderer.invoke("git:commitFileDiff", { projectRoot, hash, filePath }),

  // CLI agent events (Main → Renderer)
  onCliStream: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("cli:stream", handler);
    return () => ipcRenderer.removeListener("cli:stream", handler);
  },
  onCliComplete: (callback: (data: { tabId: string; success: boolean; stopReason?: string; error?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; success: boolean; stopReason?: string; error?: string }) => callback(data);
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
  onFileChanged: (callback: (data: { projectRoot: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { projectRoot: string }) => callback(data);
    ipcRenderer.on("fs:fileChanged", handler);
    return () => ipcRenderer.removeListener("fs:fileChanged", handler);
  },
});
