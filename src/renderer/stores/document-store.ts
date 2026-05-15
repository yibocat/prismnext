import { create } from "zustand";

export interface ProjectFile {
  id: string;
  name: string;
  relativePath: string;
  type: "tex" | "image" | "pdf" | "style" | "other";
  content?: string;
  isDirty?: boolean;
}

interface DocumentState {
  files: ProjectFile[];
  folders: string[];
  activeFileId: string | null;
  initialized: boolean;
  projectRoot: string | null;
  setActiveFile: (id: string) => void;
  setContent: (content: string) => void;
  createNewFile: (name: string, type: "tex" | "image", folder?: string) => void;
  createFolder: (name: string, parent?: string) => void;
  deleteFile: (id: string) => void;
  deleteFolder: (folderPath: string) => void;
  renameFile: (id: string, newName: string) => void;
  requestJumpToPosition: (position: number) => void;
  jumpTarget: number | null;
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

export const useDocumentStore = create<DocumentState>((set) => ({
  files: [
    {
      id: "main",
      name: "main.tex",
      relativePath: "main.tex",
      type: "tex",
      content: defaultContent,
      isDirty: false,
    },
  ],
  folders: [],
  activeFileId: "main",
  initialized: true,
  projectRoot: null,
  jumpTarget: null,

  setActiveFile: (id) => set({ activeFileId: id }),

  setContent: (content) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.id === s.activeFileId ? { ...f, content, isDirty: true } : f
      ),
    })),

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
      files: [...s.files, { id, name, relativePath, type, content, isDirty: false }],
      activeFileId: id,
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
      return { files, activeFileId };
    }),

  deleteFolder: (folderPath) =>
    set((s) => {
      // Remove all files in this folder
      const files = s.files.filter(
        (f) => !f.relativePath.startsWith(`${folderPath}/`)
      );
      // Remove the folder and all sub-folders
      const folders = s.folders.filter(
        (f) => f !== folderPath && !f.startsWith(`${folderPath}/`)
      );
      // Fix active file if it was in deleted folder
      const activeFileId =
        s.activeFileId && files.find((f) => f.id === s.activeFileId)
          ? s.activeFileId
          : files.length > 0
            ? files[0].id
            : null;
      return { files, folders, activeFileId };
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
      return {
        files: s.files.map((f) =>
          f.id === id
            ? { ...f, name: newName, relativePath: newRelativePath, id: newId }
            : f
        ),
        activeFileId:
          s.activeFileId === id ? newId : s.activeFileId,
      };
    }),

  requestJumpToPosition: (position) => set({ jumpTarget: position }),
}));
