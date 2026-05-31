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

  // CLI agent operations
  cliDispose: () => Promise<{ success: boolean }>;
  cliPrewarm: (projectPath: string, tabId?: string) => Promise<{ success: boolean }>;
  cliStatus: () => Promise<{ available: boolean; agentId?: string; agentName?: string; error?: string }>;
  cliSend: (args: { projectPath: string; prompt: string; tabId?: string; agent?: string; model?: string | null; sessionId?: string | null }) => Promise<void>;
  cliSetGateway: (baseUrl?: string, apiKey?: string) => Promise<void>;
  cliCancel: (tabId?: string) => Promise<void>;
  cliCloseSession: (tabId?: string) => Promise<void>;
  cliAnswer: (tabId: string, answer: string) => Promise<void>;
  cliListSessions: (projectPath: string) => Promise<Array<{ id: string; title: string; lastModified: number; createdAt: number }>>;
  cliLoadSession: (projectPath: string, sessionId: string) => Promise<any[]>;
  cliDeleteSession: (projectPath: string, sessionId: string) => Promise<{ success: boolean; error?: string }>;

  // CLI agent events (Main → Renderer)
  onCliStream: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  onCliComplete: (callback: (data: { tabId: string; success: boolean; stopReason?: string; error?: string }) => void) => () => void;
  onCliStderr: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  onCliSessionCreated: (callback: (data: { tabId: string; sessionId: string; agentId: string }) => void) => () => void;
  removeCliListeners: () => void;

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
