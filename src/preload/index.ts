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
  cliSend: (args: { projectPath: string; prompt: string; tabId?: string; agent?: string; model?: string | null }) =>
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
});
