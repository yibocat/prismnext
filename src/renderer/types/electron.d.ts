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

  // Window operations
  windowSetTitle: (title: string) => Promise<void>;

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
  claudeListSessions: (projectPath: string) => Promise<Array<{ id: string; title: string; lastModified: number }>>;
  claudeLoadSession: (projectPath: string, sessionId: string) => Promise<any[]>;

  // Claude events (Main → Renderer)
  onClaudeStream: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  onClaudeComplete: (callback: (data: { tabId: string; success: boolean }) => void) => () => void;
  onClaudeStderr: (callback: (data: { tabId: string; data: string }) => void) => () => void;
  removeClaudeListeners: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
