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
  fsExists: (absPath: string) => Promise<boolean>;
  projectCreate: (rootPath: string) => Promise<void>;
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
  ) => Promise<{ pdfBytes: ArrayBuffer } | { error: string }>;
  compileSynctex: (
    projectDir: string,
    page: number,
    x: number,
    y: number,
  ) => Promise<SynctexResult | null>;
  compileDetectTexlive: () => Promise<CompilerStatus>;

  // Agent operations (ACP-based)
  agentDispose: () => Promise<{ success: boolean }>;
  agentPrewarm: (projectPath: string, tabId?: string) => Promise<{ success: boolean }>;
  agentStatus: () => Promise<{ available: boolean; agentId?: string; agentName?: string; error?: string }>;
  agentSend: (projectPath: string, prompt: string, tabId?: string, agentId?: string, sessionId?: string, model?: string | null) => Promise<void>;
  agentCancel: (tabId?: string) => Promise<void>;
  agentCloseSession: (tabId?: string) => Promise<void>;
  agentAnswer: (tabId: string, answer: string) => Promise<void>;
  agentListSessions: (projectPath: string) => Promise<Array<{ id: string; title: string; lastModified: number; createdAt: number }>>;
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
    lastProjectPath?: string;
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
