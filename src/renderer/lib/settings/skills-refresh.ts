import { create } from "zustand";

/** Bump after skill install/create/edit/delete so the main list reloads. */
export const useSkillsRefreshStore = create<{
  tick: number;
  bump: () => void;
}>()((set) => ({
  tick: 0,
  bump: () => set((s) => ({ tick: s.tick + 1 })),
}));

export function bumpSkillsRefresh(): void {
  useSkillsRefreshStore.getState().bump();
}
