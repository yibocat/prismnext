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
    packs: [],
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

  const packs: PacksState["packs"] = [];
  if (Array.isArray(obj.packs)) {
    for (const entry of obj.packs) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      if (typeof rec.packId !== "string" || !rec.packId) continue;
      packs.push({
        packId: rec.packId,
        version: typeof rec.version === "string" ? rec.version : "0.0.0",
        enabled: rec.enabled !== false,
        installedAt:
          typeof rec.installedAt === "string" ? rec.installedAt : new Date(0).toISOString(),
      });
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
    packs,
    disabledContent: [...new Set(disabledContent)],
    contentOverrides,
  };
}
