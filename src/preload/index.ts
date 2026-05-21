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

  // Claude operations
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  claudeSend: (projectPath: string, prompt: string, sessionId?: string, tabId?: string, model?: string, effortLevel?: string) =>
    ipcRenderer.invoke("claude:send", { projectPath, prompt, sessionId, tabId, model, effortLevel }),
  claudeCancel: (tabId?: string) =>
    ipcRenderer.invoke("claude:cancel", { tabId }),
  claudeAnswer: (tabId: string, answer: string) =>
    ipcRenderer.invoke("claude:answer", { tabId, answer }),
  claudeListSessions: (projectPath: string) =>
    ipcRenderer.invoke("claude:listSessions", { projectPath }),
  claudeLoadSession: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("claude:loadSession", { projectPath, sessionId }),

  // Agent operations (ACP-based)
  agentStatus: () => ipcRenderer.invoke("agent:status"),
  agentSend: (projectPath: string, prompt: string, tabId?: string, agentId?: string) =>
    ipcRenderer.invoke("agent:send", { projectPath, prompt, tabId, agentId }),
  agentCancel: (tabId?: string) =>
    ipcRenderer.invoke("agent:cancel", { tabId }),
  agentAnswer: (tabId: string, answer: string) =>
    ipcRenderer.invoke("agent:answer", { tabId, answer }),
  agentListSessions: (projectPath: string) =>
    ipcRenderer.invoke("agent:listSessions", { projectPath }),
  agentLoadSession: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("agent:loadSession", { projectPath, sessionId }),
  agentDeleteSession: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("agent:deleteSession", { projectPath, sessionId }),

  // Settings operations
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSet: (patch: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:set", patch),

  // Claude events (Main → Renderer)
  onClaudeStream: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("claude:stream", handler);
    return () => ipcRenderer.removeListener("claude:stream", handler);
  },
  onClaudeComplete: (callback: (data: { tabId: string; success: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; success: boolean }) => callback(data);
    ipcRenderer.on("claude:complete", handler);
    return () => ipcRenderer.removeListener("claude:complete", handler);
  },
  onClaudeStderr: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("claude:stderr", handler);
    return () => ipcRenderer.removeListener("claude:stderr", handler);
  },
  removeClaudeListeners: () => {
    ipcRenderer.removeAllListeners("claude:stream");
    ipcRenderer.removeAllListeners("claude:complete");
    ipcRenderer.removeAllListeners("claude:stderr");
  },

  // Agent events (Main → Renderer)
  onAgentStream: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("agent:stream", handler);
    return () => ipcRenderer.removeListener("agent:stream", handler);
  },
  onAgentComplete: (callback: (data: { tabId: string; success: boolean; stopReason?: string; error?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; success: boolean; stopReason?: string; error?: string }) => callback(data);
    ipcRenderer.on("agent:complete", handler);
    return () => ipcRenderer.removeListener("agent:complete", handler);
  },
  onAgentStderr: (callback: (data: { tabId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; data: string }) => callback(data);
    ipcRenderer.on("agent:stderr", handler);
    return () => ipcRenderer.removeListener("agent:stderr", handler);
  },
  onAgentSessionCreated: (callback: (data: { tabId: string; sessionId: string; agentId: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; sessionId: string; agentId: string }) => callback(data);
    ipcRenderer.on("agent:sessionCreated", handler);
    return () => ipcRenderer.removeListener("agent:sessionCreated", handler);
  },
  removeAgentListeners: () => {
    ipcRenderer.removeAllListeners("agent:stream");
    ipcRenderer.removeAllListeners("agent:complete");
    ipcRenderer.removeAllListeners("agent:stderr");
  },
});
