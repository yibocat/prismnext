import { create } from "zustand";

export type AppMode = "manuscript" | "vault" | "zotero" | "chat" | "code";

interface LayoutState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;

  sidebarExpanded: boolean;
  sidebarWidth: number;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeMode: "chat",
  setActiveMode: (mode) => set({ activeMode: mode }),

  sidebarExpanded: true,
  sidebarWidth: 240,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
