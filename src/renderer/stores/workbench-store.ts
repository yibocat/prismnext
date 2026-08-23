import { create } from "zustand";
import {
  workbenchStateFromOpenResult,
  type WorkbenchProjectMember,
  type WorkbenchState,
} from "../../shared/workbench/api";
export {
  applyVisibleIdReorder,
  moveListItem,
} from "../../shared/workbench/api";
import { workbenchDesktop } from "@/lib/desktop-api/workbench";

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

export function anyWorkbenchProjectExpanded(
  memberIds: readonly string[],
  expandedIds: readonly string[] | null | undefined,
  focusProjectId: string,
): boolean {
  return memberIds.some((id) => isWorkbenchProjectExpanded(id, expandedIds, focusProjectId));
}

export type SessionDateBucket = "today" | "yesterday" | "week" | "month" | "older";

const DAY_MS = 86_400_000;

export const SESSION_DATE_BUCKET_ORDER: SessionDateBucket[] = [
  "today",
  "yesterday",
  "week",
  "month",
  "older",
];

export function sessionDateBucket(ts: number, now = Date.now()): SessionDateBucket {
  const day = new Date(now);
  const today = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  if (ts >= today) return "today";
  if (ts >= today - DAY_MS) return "yesterday";
  if (ts >= today - 7 * DAY_MS) return "week";
  if (ts >= today - 30 * DAY_MS) return "month";
  return "older";
}

export function groupSessionsByUpdatedAt<T extends { lastModified: number }>(
  sessions: readonly T[],
  now = Date.now(),
): Array<{ bucket: SessionDateBucket; sessions: T[] }> {
  const buckets = new Map<SessionDateBucket, T[]>();
  for (const session of sessions) {
    const bucket = sessionDateBucket(session.lastModified, now);
    const list = buckets.get(bucket);
    if (list) list.push(session);
    else buckets.set(bucket, [session]);
  }
  return SESSION_DATE_BUCKET_ORDER.flatMap((bucket) => {
    const list = buckets.get(bucket);
    return list?.length ? [{ bucket, sessions: list }] : [];
  });
}

export function displayNameFromPath(lastPath: string): string {
  const parts = lastPath.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.at(-1) || lastPath;
}

/** Stable fallback while the default is off the workbench — Zustand selectors must not allocate every snapshot. */
let cachedDefaultFallback: WorkbenchProjectMember | null = null;
let cachedSelectableOffList: {
  members: WorkbenchProjectMember[];
  fallback: WorkbenchProjectMember;
  list: WorkbenchProjectMember[];
} | null = null;

/** Default role as a member — even when it is not on the workbench list. */
export function defaultProjectAsMember(state: {
  defaultProjectId: string;
  defaultLastPath: string;
  members: WorkbenchProjectMember[];
}): WorkbenchProjectMember | null {
  const id = state.defaultProjectId.trim();
  const lastPath = state.defaultLastPath.trim();
  if (!id || !lastPath) {
    cachedDefaultFallback = null;
    return null;
  }
  const listed = state.members.find((member) => member.id === id);
  if (listed) return listed;
  const displayName = displayNameFromPath(lastPath);
  if (
    cachedDefaultFallback
    && cachedDefaultFallback.id === id
    && cachedDefaultFallback.lastPath === lastPath
    && cachedDefaultFallback.displayName === displayName
  ) {
    return cachedDefaultFallback;
  }
  cachedDefaultFallback = { id, lastPath, displayName };
  return cachedDefaultFallback;
}

export function resolveWorkbenchMember(
  state: {
    defaultProjectId: string;
    defaultLastPath: string;
    members: WorkbenchProjectMember[];
  },
  projectId: string,
): WorkbenchProjectMember | null {
  const id = projectId.trim();
  if (!id) return null;
  const member = state.members.find((item) => item.id === id);
  if (member?.lastPath.trim()) return member;
  const fallback = defaultProjectAsMember(state);
  return fallback?.id === id ? fallback : null;
}

/** Workbench member or off-list default at this folder. */
export function resolveWorkbenchMemberByPath(
  state: {
    defaultProjectId: string;
    defaultLastPath: string;
    members: WorkbenchProjectMember[];
  },
  path: string,
): WorkbenchProjectMember | null {
  const folder = path.trim();
  if (!folder) return null;
  const member = state.members.find((item) => sameProjectPath(item.lastPath, folder));
  if (member?.lastPath.trim()) return member;
  const fallback = defaultProjectAsMember(state);
  return fallback && sameProjectPath(fallback.lastPath, folder) ? fallback : null;
}

/** Workbench members, plus the default project when it is not on the list. */
export function selectableWorkbenchProjects(state: {
  defaultProjectId: string;
  defaultLastPath: string;
  members: WorkbenchProjectMember[];
}): WorkbenchProjectMember[] {
  const fallback = defaultProjectAsMember(state);
  if (!fallback) return state.members;
  if (state.members.some((member) => member.id === fallback.id)) return state.members;
  if (
    cachedSelectableOffList
    && cachedSelectableOffList.members === state.members
    && cachedSelectableOffList.fallback === fallback
  ) {
    return cachedSelectableOffList.list;
  }
  const list = [fallback, ...state.members];
  cachedSelectableOffList = { members: state.members, fallback, list };
  return list;
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
  updateDisplayName: (projectId: string, displayName: string) => Promise<WorkbenchState>;
  reorderProjects: (projectIds: string[]) => Promise<WorkbenchState>;
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
    const state = await workbenchDesktop.workbenchGetState();
    set(applyState(state));
    return state;
  },
  setDefault: async (projectId) => {
    const state = await workbenchDesktop.workbenchSetDefault(projectId);
    set(applyState(state));
    return state;
  },
  setDefaultFromFolder: async (absPath) => {
    const state = await workbenchDesktop.workbenchSetDefaultFromFolder(absPath);
    set(applyState(state));
    return state;
  },
  // Membership only. Opening a folder from the UI goes through
  // document-store.openProject → switchWorkbenchFocus — do not reset here.
  openFolder: async (absPath) => {
    const result = await workbenchDesktop.workbenchOpenFolder(absPath);
    const state = workbenchStateFromOpenResult(result);
    set(applyState(state));
    return state;
  },
  removeProject: async (projectId) => {
    const state = await workbenchDesktop.workbenchRemoveProject(projectId);
    set(applyState(state));
    return state;
  },
  updateDisplayName: async (projectId, displayName) => {
    const state = await workbenchDesktop.workbenchUpdateDisplayName(projectId, displayName);
    set(applyState(state));
    return state;
  },
  reorderProjects: async (projectIds) => {
    set((state) => {
      const byId = new Map(state.members.map((member) => [member.id, member]));
      return {
        workbenchProjectIds: projectIds,
        members: projectIds
          .map((id) => byId.get(id))
          .filter((member): member is WorkbenchProjectMember => Boolean(member)),
      };
    });
    const state = await workbenchDesktop.workbenchReorderProjects(projectIds);
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
