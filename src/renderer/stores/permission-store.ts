import { create } from "zustand";

export type PermissionOption = {
  optionId: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
  name?: string;
};

export function pickActivePermission(
  tabId: string,
  permissions: PendingPermission[],
): PendingPermission | undefined {
  const tabPerms = permissions.filter((p) => p.tabId === tabId);
  if (tabPerms.length === 0) return undefined;
  const withToolId = tabPerms.filter((p) => p.toolCallId);
  return withToolId[0] ?? tabPerms[0];
}

export function listBackgroundPending(
  permissions: PendingPermission[],
  activeTabId: string,
): PendingPermission[] {
  const seen = new Set<string>();
  const out: PendingPermission[] = [];
  for (const permission of permissions) {
    if (!permission.tabId || permission.tabId === activeTabId) continue;
    if (seen.has(permission.tabId)) continue;
    seen.add(permission.tabId);
    out.push(permission);
  }
  return out;
}

export function hasPendingPermission(
  permissions: PendingPermission[],
  tabId: string,
): boolean {
  return permissions.some((permission) => permission.tabId === tabId);
}

export interface PendingPermission {
  id: string;
  tabId: string;
  toolCallId?: string;
  toolName?: string;
  message: string;
  options: PermissionOption[] | Record<string, unknown>;
  /** Tool args from `permission_requested` — used when the Conversation block is not found yet. */
  args?: Record<string, unknown>;
}

interface PermissionState {
  permissions: PendingPermission[];
  resolvedToolIds: Record<string, string[]>;
  deniedToolIds: Record<string, string[]>;
  addPermission: (permission: PendingPermission) => void;
  clearPermission: (id: string) => void;
  clearPermissionsForTool: (tabId: string, toolCallId: string) => void;
  clearTabPermissions: (tabId: string) => void;
  clearAllPermissions: () => void;
  markToolResolved: (tabId: string, toolUseId: string) => void;
  markToolDenied: (tabId: string, toolUseId: string) => void;
  isToolResolved: (tabId: string, toolUseId: string) => boolean;
  isToolDenied: (tabId: string, toolUseId: string) => boolean;
  getPermissionForTool: (tabId: string, toolUseId: string) => PendingPermission | undefined;
}

export const usePermissionStore = create<PermissionState>()((set, get) => ({
  permissions: [],
  resolvedToolIds: {},
  deniedToolIds: {},

  addPermission: (permission) => {
    set((state) => {
      const existingIdx = state.permissions.findIndex((p) => p.id === permission.id);
      if (existingIdx >= 0) {
        const next = [...state.permissions];
        next[existingIdx] = permission;
        return { permissions: next };
      }
      if (permission.toolCallId) {
        const dupIdx = state.permissions.findIndex(
          (p) => p.tabId === permission.tabId && p.toolCallId === permission.toolCallId,
        );
        if (dupIdx >= 0) {
          const next = [...state.permissions];
          next[dupIdx] = permission;
          return { permissions: next };
        }
      }
      return { permissions: [...state.permissions, permission] };
    });
  },

  clearPermission: (id) => {
    set((state) => ({
      permissions: state.permissions.filter((p) => p.id !== id),
    }));
  },

  clearPermissionsForTool: (tabId, toolCallId) => {
    set((state) => ({
      permissions: state.permissions.filter(
        (p) => !(p.tabId === tabId && p.toolCallId === toolCallId),
      ),
    }));
  },

  clearTabPermissions: (tabId) => {
    set((state) => ({
      permissions: state.permissions.filter((p) => p.tabId !== tabId),
      resolvedToolIds: Object.fromEntries(
        Object.entries(state.resolvedToolIds).filter(([key]) => key !== tabId),
      ),
      deniedToolIds: Object.fromEntries(
        Object.entries(state.deniedToolIds).filter(([key]) => key !== tabId),
      ),
    }));
  },

  clearAllPermissions: () => set({ permissions: [], resolvedToolIds: {}, deniedToolIds: {} }),

  markToolResolved: (tabId, toolUseId) => {
    if (!toolUseId) return;
    set((state) => {
      const ids = state.resolvedToolIds[tabId] || [];
      if (ids.includes(toolUseId)) return {};
      return {
        resolvedToolIds: {
          ...state.resolvedToolIds,
          [tabId]: [...ids, toolUseId],
        },
      };
    });
  },

  isToolResolved: (tabId, toolUseId) => {
    return !!toolUseId && (get().resolvedToolIds[tabId] || []).includes(toolUseId);
  },

  markToolDenied: (tabId, toolUseId) => {
    if (!toolUseId) return;
    set((state) => {
      const ids = state.deniedToolIds[tabId] || [];
      if (ids.includes(toolUseId)) return {};
      return {
        deniedToolIds: {
          ...state.deniedToolIds,
          [tabId]: [...ids, toolUseId],
        },
      };
    });
  },

  isToolDenied: (tabId, toolUseId) => {
    return !!toolUseId && (get().deniedToolIds[tabId] || []).includes(toolUseId);
  },

  getPermissionForTool: (tabId, toolUseId) => {
    if (!toolUseId) return undefined;
    return get().permissions.find(
      (p) => p.tabId === tabId && p.toolCallId === toolUseId,
    );
  },
}));
