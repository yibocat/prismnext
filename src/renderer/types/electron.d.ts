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
  fsRead: (absPath: string) => Promise<{ content: string }>;
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

  // Dialog operations
  dialogOpenFolder: () => Promise<{
    canceled: boolean;
    path: string | null;
  }>;

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
  ) => Promise<{ pdfBytes: ArrayBuffer } | { error: string }>;
  compileSynctex: (
    projectDir: string,
    page: number,
    x: number,
    y: number,
  ) => Promise<SynctexResult | null>;
  compileDetectTexlive: () => Promise<CompilerStatus>;

  // Claude operations
  claudeStatus: () => Promise<{
    installed: boolean;
    authenticated: boolean;
    binaryPath: string | null;
  }>;
  claudeSend: (
    projectPath: string,
    prompt: string,
    sessionId?: string,
    tabId?: string,
    model?: string,
    effortLevel?: string,
  ) => Promise<void>;
  claudeCancel: (tabId?: string) => Promise<void>;
  claudeAnswer: (tabId: string, answer: string) => Promise<void>;
  claudeListSessions: (projectPath: string) => Promise<Array<{ id: string; title: string; lastModified: number }>>;
  claudeLoadSession: (projectPath: string, sessionId: string) => Promise<any[]>;

  // Claude events (Main → Renderer)
  onClaudeStream: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  onClaudeComplete: (callback: (data: { tabId: string; success: boolean }) => void) => () => void;
  onClaudeStderr: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  removeClaudeListeners: () => void;

  // Agent operations (ACP-based)
  agentStatus: () => Promise<{ available: boolean; agentId?: string; agentName?: string; error?: string }>;
  agentSend: (projectPath: string, prompt: string, tabId?: string, agentId?: string) => Promise<void>;
  agentCancel: (tabId?: string) => Promise<void>;
  agentAnswer: (tabId: string, answer: string) => Promise<void>;
  agentListSessions: (projectPath: string) => Promise<Array<{ id: string; title: string; lastModified: number }>>;
  agentLoadSession: (projectPath: string, sessionId: string) => Promise<any[]>;
  agentDeleteSession: (projectPath: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;

  // Agent events (Main → Renderer)
  onAgentStream: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  onAgentComplete: (callback: (data: { tabId: string; success: boolean; stopReason?: string; error?: string }) => void) => () => void;
  onAgentStderr: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  onAgentSessionCreated: (callback: (data: { tabId: string; sessionId: string; agentId: string }) => void) => () => void;
  removeAgentListeners: () => void;

  // Settings operations
  settingsGet: () => Promise<{
    aiModel: string;
    effortLevel: string;
    theme: string;
    sidebarCollapsed: boolean;
    rightPanelCollapsed: boolean;
    zoteroApiKey?: string;
    zoteroUserId?: string;
  }>;
  settingsSet: (patch: Record<string, unknown>) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
