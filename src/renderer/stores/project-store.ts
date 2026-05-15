import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

interface ProjectState {
  recentProjects: RecentProject[];
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
}

const MAX_RECENT_PROJECTS = 10;

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      recentProjects: [],

      addRecentProject: (path: string) => {
        set((state) => {
          const name = path.split(/[/\\]/).pop() || path;
          const existing = state.recentProjects.find((p) => p.path === path);
          const now = Date.now();

          let newProjects: RecentProject[];

          if (existing) {
            // Update existing project's lastOpened time
            newProjects = [
              { path, name, lastOpened: now },
              ...state.recentProjects.filter((p) => p.path !== path),
            ];
          } else {
            // Add new project
            newProjects = [{ path, name, lastOpened: now }, ...state.recentProjects];
          }

          // Keep only the most recent MAX_RECENT_PROJECTS
          return {
            recentProjects: newProjects.slice(0, MAX_RECENT_PROJECTS),
          };
        });
      },

      removeRecentProject: (path: string) => {
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.path !== path),
        }));
      },
    }),
    {
      name: "prism-next-projects",
    },
  ),
);
