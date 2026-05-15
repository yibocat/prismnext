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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
