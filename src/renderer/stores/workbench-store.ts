import { create } from "zustand";
import {
  workbenchStateFromOpenResult,
  type WorkbenchProjectMember,
  type WorkbenchState,
} from "../../shared/workbench/api";

export function sameProjectPath(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  return norm(a) === norm(b);
}

export interface WorkbenchSessionRow {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
  directory?: string;
  projectId: string;
}

export function groupSessionsByProject(
  members: WorkbenchProjectMember[],
  sessions: WorkbenchSessionRow[],
): Array<{ member: WorkbenchProjectMember; sessions: WorkbenchSessionRow[] }> {
  return members.map((member) => ({
    member,
    sessions: sessions.filter((session) => session.projectId === member.id),
  }));
}

/** `null` = never toggled; only the focused project starts open. */
export function isWorkbenchProjectExpanded(
  projectId: string,
  expandedIds: readonly string[] | null | undefined,
  focusProjectId: string,
): boolean {
  if (expandedIds == null) return Boolean(projectId) && projectId === focusProjectId;
  return expandedIds.includes(projectId);
}

export function toggleWorkbenchProjectExpanded(
  projectId: string,
  expandedIds: readonly string[] | null | undefined,
  focusProjectId: string,
): string[] {
  const current = expandedIds == null
    ? (focusProjectId ? [focusProjectId] : [])
    : [...expandedIds];
  return current.includes(projectId)
    ? current.filter((id) => id !== projectId)
    : [...current, projectId];
}

export function ensureWorkbenchProjectExpanded(
  projectId: string,
  expandedIds: readonly string[] | null | undefined,
  focusProjectId: string,
): string[] {
  const current = expandedIds == null
    ? (focusProjectId ? [focusProjectId] : [])
    : [...expandedIds];
  if (!projectId || current.includes(projectId)) return current;
  return [...current, projectId];
}

export function lastPathForSession(conversationId: string): string | null {
  const state = useWorkbenchStore.getState();
  const projectId = state.sessionProjectIds[conversationId];
  if (!projectId) return null;
  return state.members.find((member) => member.id === projectId)?.lastPath ?? null;
}

export function projectRootForSession(
  conversationId: string,
  fallback?: string | null,
): string | null {
  return lastPathForSession(conversationId) || fallback || null;
}

interface WorkbenchStoreState extends WorkbenchState {
  loaded: boolean;
  focusConversationId: string | null;
  focusProjectId: string;
  sessionProjectIds: Record<string, string>;
  hydrate: () => Promise<WorkbenchState>;
  setDefault: (projectId: string) => Promise<WorkbenchState>;
  setDefaultFromFolder: (absPath: string) => Promise<WorkbenchState>;
  openFolder: (absPath: string) => Promise<WorkbenchState>;
  removeProject: (projectId: string) => Promise<WorkbenchState>;
  setFocusConversation: (id: string | null) => void;
  setFocusProject: (projectId: string) => void;
  recordSessionProject: (conversationId: string, projectId: string) => void;
  recordSessionProjects: (map: Record<string, string>) => void;
}

const empty: WorkbenchState = {
  defaultProjectId: "",
  defaultLastPath: "",
  workbenchProjectIds: [],
  members: [] as WorkbenchProjectMember[],
};

function applyState(state: WorkbenchState): Partial<WorkbenchStoreState> {
  return { ...state, loaded: true };
}

export const useWorkbenchStore = create<WorkbenchStoreState>((set) => ({
  ...empty,
  loaded: false,
  focusConversationId: null,
  focusProjectId: "",
  sessionProjectIds: {},
  hydrate: async () => {
    const state = await window.electronAPI.workbenchGetState();
    set(applyState(state));
    return state;
  },
  setDefault: async (projectId) => {
    const state = await window.electronAPI.workbenchSetDefault(projectId);
    set(applyState(state));
    return state;
  },
  setDefaultFromFolder: async (absPath) => {
    const state = await window.electronAPI.workbenchSetDefaultFromFolder(absPath);
    set(applyState(state));
    return state;
  },
  // Membership only. Opening a folder from the UI goes through
  // document-store.openProject → switchWorkbenchFocus — do not reset here.
  openFolder: async (absPath) => {
    const result = await window.electronAPI.workbenchOpenFolder(absPath);
    const state = workbenchStateFromOpenResult(result);
    set(applyState(state));
    return state;
  },
  removeProject: async (projectId) => {
    const state = await window.electronAPI.workbenchRemoveProject(projectId);
    set(applyState(state));
    return state;
  },
  setFocusConversation: (id) => set({ focusConversationId: id }),
  setFocusProject: (projectId) => set({ focusProjectId: projectId }),
  recordSessionProject: (conversationId, projectId) => {
    if (!conversationId.trim() || !projectId.trim()) return;
    set((state) => ({
      sessionProjectIds: { ...state.sessionProjectIds, [conversationId]: projectId },
    }));
  },
  recordSessionProjects: (map) => {
    set((state) => ({
      sessionProjectIds: { ...state.sessionProjectIds, ...map },
    }));
  },
}));
