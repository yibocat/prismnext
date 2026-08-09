/**
 * PacksState 纯函数助手（无副作用）——main 侧 packs-state.ts 负责落盘。
 */

import {
  PACKS_STATE_VERSION,
  type Fqid,
  type PacksState,
} from "./types";

export function emptyPacksState(): PacksState {
  return {
    stateVersion: PACKS_STATE_VERSION,
    projectPackStates: {},
    disabledContent: [],
    contentOverrides: {},
  };
}

/** `${packId}:${contentId}` */
export function toFqid(packId: string, contentId: string): Fqid {
  return `${packId}:${contentId}`;
}

/** 拆 FQID；不含 `:` 时返回 null（调用方按裸 id 逻辑处理） */
export function parseFqid(fqid: string): { packId: string; contentId: string } | null {
  const idx = fqid.indexOf(":");
  if (idx <= 0 || idx === fqid.length - 1) return null;
  return { packId: fqid.slice(0, idx), contentId: fqid.slice(idx + 1) };
}

/** fqid 是否属于某个 pack */
export function fqidBelongsToPack(fqid: string, packId: string): boolean {
  return fqid.startsWith(`${packId}:`);
}

/**
 * 防御性解析 packs.json 原文。任何字段畸形都退化为安全默认，
 * 不让单个坏字段毁掉整个项目状态。
 */
export function normalizePacksState(raw: unknown): PacksState {
  if (!raw || typeof raw !== "object") return emptyPacksState();
  const obj = raw as Record<string, unknown>;

  // projectPackStates: { packId: { enabled } } — only records explicit overrides
  const projectPackStates: PacksState["projectPackStates"] = {};
  if (obj.projectPackStates && typeof obj.projectPackStates === "object") {
    for (const [packId, value] of Object.entries(obj.projectPackStates as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const st = value as Record<string, unknown>;
      if (typeof st.enabled !== "boolean") continue;
      projectPackStates[packId] = { enabled: st.enabled };
    }
  }

  const disabledContent: Fqid[] = Array.isArray(obj.disabledContent)
    ? obj.disabledContent.filter((x): x is string => typeof x === "string" && parseFqid(x) !== null)
    : [];

  const contentOverrides: PacksState["contentOverrides"] = {};
  if (obj.contentOverrides && typeof obj.contentOverrides === "object") {
    for (const [key, value] of Object.entries(obj.contentOverrides as Record<string, unknown>)) {
      if (!parseFqid(key)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      contentOverrides[key] = value as PacksState["contentOverrides"][string];
    }
  }

  return {
    stateVersion: PACKS_STATE_VERSION,
    defaultOrchestrator:
      typeof obj.defaultOrchestrator === "string" && parseFqid(obj.defaultOrchestrator)
        ? obj.defaultOrchestrator
        : undefined,
    projectPackStates,
    disabledContent: [...new Set(disabledContent)],
    contentOverrides,
  };
}
