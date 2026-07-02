import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Persists intensive-reading paper IDs per OpenCode chat session so the list
 * survives app restarts when the user reopens a session from history.
 */
interface IntensiveReadingState {
  bySession: Record<string, string[]>;
  getForSession: (sessionId: string) => string[];
  setForSession: (sessionId: string, paperIds: string[]) => void;
  removeSession: (sessionId: string) => void;
}

export const useIntensiveReadingStore = create<IntensiveReadingState>()(
  persist(
    (set, get) => ({
      bySession: {},
      getForSession: (sessionId) => {
        const id = sessionId.trim();
        if (!id) return [];
        return get().bySession[id] ?? [];
      },
      setForSession: (sessionId, paperIds) => {
        const id = sessionId.trim();
        if (!id) return;
        const unique = [...new Set(paperIds.filter(Boolean))];
        set((s) => {
          if (unique.length === 0) {
            const { [id]: _removed, ...rest } = s.bySession;
            return { bySession: rest };
          }
          return { bySession: { ...s.bySession, [id]: unique } };
        });
      },
      removeSession: (sessionId) => {
        const id = sessionId.trim();
        if (!id) return;
        set((s) => {
          const { [id]: _removed, ...rest } = s.bySession;
          return { bySession: rest };
        });
      },
    }),
    {
      name: "prism-intensive-reading",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ bySession: s.bySession }),
    },
  ),
);
