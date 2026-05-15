import { create } from "zustand";

export interface ProjectFile {
  id: string;
  name: string;
  relativePath: string;
  type: "tex" | "image" | "pdf" | "style" | "other";
}

// Content stored separately to prevent re-renders on typing
interface FileContent {
  content: string;
  isDirty: boolean;
}

interface DocumentState {
  files: ProjectFile[];
  folders: string[];
  activeFileId: string | null;
  initialized: boolean;
  projectRoot: string | null;
  // Separate content storage - changes on typing don't affect files array
  fileContents: Map<string, FileContent>;
  jumpTarget: number | null;

  // Actions
  setActiveFile: (id: string) => void;
  getContent: (id: string) => string;
  setContent: (id: string, content: string) => void;
  isDirty: (id: string) => boolean;
  createNewFile: (name: string, type: "tex" | "image", folder?: string) => void;
  createFolder: (name: string, parent?: string) => void;
  deleteFile: (id: string) => void;
  deleteFolder: (folderPath: string) => void;
  renameFile: (id: string, newName: string) => void;
  requestJumpToPosition: (position: number) => void;
}

const defaultContent = String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}

\title{Untitled Document}
\author{}
\date{\today}

\begin{document}

\maketitle

\section{Introduction}

Hello, Prism!

\end{document}
`;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  files: [
    {
      id: "main",
      name: "main.tex",
      relativePath: "main.tex",
      type: "tex",
    },
  ],
  folders: [],
  activeFileId: "main",
  initialized: true,
  projectRoot: null,
  fileContents: new Map([["main", { content: defaultContent, isDirty: false }]]),
  jumpTarget: null,

  setActiveFile: (id) => set({ activeFileId: id }),

  getContent: (id) => get().fileContents.get(id)?.content ?? "",

  setContent: (id, content) => {
    const fileContents = get().fileContents;
    const existing = fileContents.get(id);
    // Only update if content actually changed
    if (existing?.content === content) return;
    const newMap = new Map(fileContents);
    newMap.set(id, { content, isDirty: true });
    set({ fileContents: newMap });
  },

  isDirty: (id) => get().fileContents.get(id)?.isDirty ?? false,

  createNewFile: (name, type, folder) => {
    const relativePath = folder ? `${folder}/${name}` : name;
    const id = relativePath;
    const content = type === "tex"
      ? String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\begin{document}

\end{document}
`
      : "";
    set((s) => ({
      files: [...s.files, { id, name, relativePath, type }],
      activeFileId: id,
      fileContents: new Map(s.fileContents).set(id, { content, isDirty: false }),
    }));
  },

  createFolder: (name, parent) => {
    const folderPath = parent ? `${parent}/${name}` : name;
    set((s) => ({
      folders: [...s.folders, folderPath],
    }));
  },

  deleteFile: (id) =>
    set((s) => {
      const files = s.files.filter((f) => f.id !== id);
      const activeFileId =
        s.activeFileId === id
          ? files.length > 0
            ? files[0].id
            : null
          : s.activeFileId;
      const fileContents = new Map(s.fileContents);
      fileContents.delete(id);
      return { files, activeFileId, fileContents };
    }),

  deleteFolder: (folderPath) =>
    set((s) => {
      const files = s.files.filter(
        (f) => !f.relativePath.startsWith(`${folderPath}/`)
      );
      const folders = s.folders.filter(
        (f) => f !== folderPath && !f.startsWith(`${folderPath}/`)
      );
      const activeFileId =
        s.activeFileId && files.find((f) => f.id === s.activeFileId)
          ? s.activeFileId
          : files.length > 0
            ? files[0].id
            : null;
      const fileContents = new Map(s.fileContents);
      s.files.forEach((f) => {
        if (f.relativePath.startsWith(`${folderPath}/`)) {
          fileContents.delete(f.id);
        }
      });
      return { files, folders, activeFileId, fileContents };
    }),

  renameFile: (id, newName) =>
    set((s) => {
      const file = s.files.find((f) => f.id === id);
      if (!file) return s;
      const parentPath = file.relativePath.includes("/")
        ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
        : "";
      const newRelativePath = parentPath
        ? `${parentPath}/${newName}`
        : newName;
      const newId = newRelativePath;
      const fileContents = new Map(s.fileContents);
      const existingContent = fileContents.get(id);
      if (existingContent) {
        fileContents.delete(id);
        fileContents.set(newId, existingContent);
      }
      return {
        files: s.files.map((f) =>
          f.id === id
            ? { ...f, name: newName, relativePath: newRelativePath, id: newId }
            : f
        ),
        activeFileId:
          s.activeFileId === id ? newId : s.activeFileId,
        fileContents,
      };
    }),

  requestJumpToPosition: (position) => set({ jumpTarget: position }),
}));
