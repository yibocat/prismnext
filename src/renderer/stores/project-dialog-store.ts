import { create } from "zustand";

interface ProjectDialogState {
  open: boolean;
  projectPath: string;
  missing: string[];
  resolve: ((value: "create" | "skip" | "cancel") => void) | null;

  show: (path: string, missing: string[]) => Promise<"create" | "skip" | "cancel">;
  close: (result: "create" | "skip" | "cancel") => void;
}

export const useProjectDialogStore = create<ProjectDialogState>()((set, get) => ({
  open: false,
  projectPath: "",
  missing: [],
  resolve: null,

  show: (path: string, missing: string[]) => {
    return new Promise((resolve) => {
      set({ open: true, projectPath: path, missing, resolve });
    });
  },

  close: (result: "create" | "skip" | "cancel") => {
    const { resolve } = get();
    set({ open: false, projectPath: "", missing: [], resolve: null });
    resolve?.(result);
  },
}));
