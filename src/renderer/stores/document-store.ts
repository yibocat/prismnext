import { create } from "zustand";

export interface ProjectFile {
  id: string;
  name: string;
  relativePath: string;
  type: "tex" | "image" | "pdf" | "style" | "other";
  content?: string;
}

interface DocumentState {
  files: ProjectFile[];
  activeFileId: string | null;
  initialized: boolean;
  setActiveFile: (id: string) => void;
  setContent: (content: string) => void;
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
    },
  ],
  activeFileId: "main",
  initialized: true,
  setActiveFile: (id) => set({ activeFileId: id }),
  setContent: (content) =>
    set((s) => ({
      files: s.files.map((f) =>
        f.id === s.activeFileId ? { ...f, content } : f
      ),
    })),
}));
