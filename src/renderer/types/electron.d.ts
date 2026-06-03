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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
