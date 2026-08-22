import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  WorkspaceFolder,
  ManuscriptConfig,
  FolderFunction,
} from "@/types/workspace";
import {
  findManuscriptConfig,
  createDefaultFolder,
  defaultWorkspaceDirs,
} from "@/types/workspace";
import { projectDesktop } from "@/lib/desktop-api/project";

interface WorkspaceConfigState {
  workspaceDirs: WorkspaceFolder[];
  /** Derived from workspaceDirs — first manuscript entry, or null */
  manuscriptConfig: ManuscriptConfig | null;
  /** True after loadConfig succeeds */
  loaded: boolean;
  /** Error message from last operation, or null */
  error: string | null;

  // Actions
  loadConfig: (projectRoot: string) => Promise<void>;
  saveConfig: (projectRoot: string) => Promise<boolean>;
  reset: () => void;

  // Local mutations (call saveConfig to persist)
  setWorkspaceDirs: (dirs: WorkspaceFolder[]) => void;
  addFolder: (func: FolderFunction, name: string) => string | null;
  removeFolder: (index: number) => void;
  updateFolder: (index: number, patch: Partial<WorkspaceFolder>) => string | null;
}

export const useWorkspaceConfigStore = create<WorkspaceConfigState>()(
  subscribeWithSelector((set, get) => ({
    workspaceDirs: [],
    manuscriptConfig: null,
    loaded: false,
    error: null,

    loadConfig: async (projectRoot: string) => {
      // Reset before loading — prevents stale auto-save from previous project
      set({ loaded: false, workspaceDirs: [], manuscriptConfig: null, error: null });
      try {
        const dirs =
          await projectDesktop.workspaceGetConfig(projectRoot);
        set({
          workspaceDirs: dirs,
          manuscriptConfig: findManuscriptConfig(dirs),
          loaded: true,
          error: null,
        });
      } catch (e: any) {
        const defaults = defaultWorkspaceDirs();
        set({
          workspaceDirs: defaults,
          manuscriptConfig: findManuscriptConfig(defaults),
          loaded: true,
          error: e.message,
        });
      }
    },

    saveConfig: async (projectRoot: string) => {
      const { workspaceDirs } = get();
      try {
        const result =
          await projectDesktop.workspaceUpdateConfig(
            projectRoot,
            workspaceDirs,
          );
        if (!result.success) {
          set({ error: result.errors?.join("; ") || "Save failed" });
          return false;
        }
        set({ error: null });
        return true;
      } catch (e: any) {
        set({ error: e.message });
        return false;
      }
    },

    reset: () =>
      set({
        workspaceDirs: [],
        manuscriptConfig: null,
        loaded: false,
        error: null,
      }),

    setWorkspaceDirs: (dirs: WorkspaceFolder[]) =>
      set({ workspaceDirs: dirs, manuscriptConfig: findManuscriptConfig(dirs) }),

    addFolder: (func: FolderFunction, name: string) => {
      const { workspaceDirs } = get();
      // Case-insensitive duplicate check on macOS/Windows (filesystem is case-insensitive)
      const isCaseInsensitiveFs =
        typeof navigator !== "undefined" &&
        (navigator.platform.startsWith("Mac") || navigator.platform.startsWith("Win"));
      const isDuplicate = workspaceDirs.some((d) =>
        isCaseInsensitiveFs
          ? d.name.toLowerCase() === name.toLowerCase()
          : d.name === name,
      );
      if (isDuplicate) {
        return `A folder named "${name}" already exists.`;
      }
      if (func === "manuscript" && workspaceDirs.some((d) => d.function === "manuscript")) {
        return "Only one manuscript folder is allowed.";
      }
      const entry = createDefaultFolder(name, func);
      const newDirs = [...workspaceDirs, entry];
      set({ workspaceDirs: newDirs, manuscriptConfig: findManuscriptConfig(newDirs) });
      return null;
    },

    removeFolder: (index: number) => {
      const { workspaceDirs } = get();
      const newDirs = workspaceDirs.filter((_, i) => i !== index);
      set({ workspaceDirs: newDirs, manuscriptConfig: findManuscriptConfig(newDirs) });
    },

    updateFolder: (index: number, patch: Partial<WorkspaceFolder>) => {
      const { workspaceDirs } = get();
      const current = workspaceDirs[index];
      if (!current) return "Folder not found.";

      // Client-side validation — mirrors server-side validateWorkspaceDirs
      const newName = patch.name !== undefined ? patch.name : current.name;
      if (patch.name !== undefined) {
        if (!newName.trim()) return "Folder name cannot be empty.";
        if (newName.includes("/") || newName.includes("\\")) return `Folder name "${newName}" cannot contain path separators.`;
        if (newName === "." || newName === "..") return `Folder name "${newName}" is reserved.`;
        // Duplicate name check (against other folders, case-insensitive on macOS/Windows)
        const isCaseInsensitiveFs =
          typeof navigator !== "undefined" &&
          (navigator.platform.startsWith("Mac") || navigator.platform.startsWith("Win"));
        if (workspaceDirs.some((d, i) =>
          i !== index &&
          (isCaseInsensitiveFs
            ? d.name.toLowerCase() === newName.toLowerCase()
            : d.name === newName)
        )) return `A folder named "${newName}" already exists.`;
      }

      // Enforce manuscript uniqueness when changing function to "manuscript"
      if (
        patch.function === "manuscript" &&
        current.function !== "manuscript" &&
        workspaceDirs.some((d, i) => i !== index && d.function === "manuscript")
      ) {
        return "Only one manuscript folder is allowed.";
      }

      // When the function discriminator changes, reconstruct from scratch
      // to avoid stale properties (e.g., mainTex lingering on non-manuscript folders)
      let updated: WorkspaceFolder;
      if (patch.function && patch.function !== current.function) {
        // Function type changed — keep only name + apply function-specific defaults
        const newFunc = patch.function;
        updated = createDefaultFolder(
          (patch.name ?? current.name) as string,
          newFunc,
        );
        // Preserve user-overridden description if present in patch
        if (patch.description !== undefined) {
          updated = { ...updated, description: patch.description };
        } else if ("description" in current && current.description) {
          updated = { ...updated, description: current.description };
        }
      } else {
        // Same function type — safe to spread-merge
        updated = { ...current, ...patch } as WorkspaceFolder;
      }

      const newDirs = workspaceDirs.map((d, i) =>
        i === index ? updated : d,
      );
      set({ workspaceDirs: newDirs, manuscriptConfig: findManuscriptConfig(newDirs) });
      return null; // success
    },
  })),
);
