/**
 * packs-lifecycle.ts —— Pack 生命周期的校验层（§6.2 操作语义 + §9.4 联动）。
 *
 * packs-state.ts 提供纯状态操作（不写校验、不发通知）；本层在其上补齐：
 * - install：catalog 存在性 / compatible / tier license 门 / 幂等；
 * - setEnabled：core 可整包禁用（UI 负责二次确认）；local 不可禁用；
 *   installedByDefault 的 pack 无记录时按需补记录（upsert）；
 * - uninstall：core / local 结构性拒绝（治 P9：卸载 = 删记录，零文件删除）；
 * - 联动 UX：install / enable 后若 pack 声明 preferredOrchestrator 且当前
 *   默认仍是 core 默认 → 返回建议 FQID，由 UI 弹确认条（§9.4）。
 *
 * 每个变更操作末尾统一 notifyPacksChanged（resolver 失效 + experts/skills
 * OpenCode 再同步，§5.5）。
 */

import {
  CORE_PACK_ID,
  DEFAULT_ORCHESTRATOR_FQID,
  LOCAL_PACK_ID,
  type Fqid,
  type PackManifest,
  type PackRecord,
} from "../../shared/packs/types";
import { toFqid as _toFqid } from "../../shared/packs/state";
import { getPack, listPacks } from "./pack-catalog";
import { getContent, notifyPacksChanged } from "./pack-resolver";
import {
  installPackRecord,
  readPacksState,
  removePackRecord,
  setPackEnabled,
  writePacksState,
} from "./packs-state";
import { licenseGrants } from "./packs-license";

export interface PackMutationResult {
  record: PackRecord;
  /** §9.4：建议设为默认的 orchestrator FQID（无建议 → undefined） */
  suggestedOrchestrator?: Fqid;
}

function manifestOf(packId: string): PackManifest {
  const view = getPack(packId);
  if (!view) throw new Error(`Pack not found in catalog: ${packId}`);
  return view.manifest;
}

/** §9.4：pack 声明了 preferredOrchestrator 且项目默认仍是 core 默认 → 给出建议 */
function orchestratorSuggestion(projectRoot: string, manifest: PackManifest): Fqid | undefined {
  const preferred = manifest.preferredOrchestrator?.trim();
  if (!preferred) return undefined;
  const current = readPacksState(projectRoot).defaultOrchestrator;
  if (current && current !== DEFAULT_ORCHESTRATOR_FQID) return undefined;
  const fqid = _toFqid(manifest.id, preferred);
  const content = getContent(projectRoot, fqid);
  if (!content || content.kind !== "orchestrator" || !content.enabled) return undefined;
  return fqid;
}

/**
 * install（§6.2）：校验（存在/兼容/tier 门）→ packs.json 追加 record。
 * 已安装 → 幂等返回原记录（不重复通知）。未安装成功的校验失败一律抛错。
 */
export function installPack(projectRoot: string, packId: string): PackMutationResult {
  const view = getPack(packId);
  if (!view) throw new Error(`Pack not found in catalog: ${packId}`);
  if (!view.compatible) {
    throw new Error(`Pack is incompatible with this app version: ${packId}`);
  }
  if (view.manifest.tier === "pro" && !licenseGrants(view.manifest.feature)) {
    throw new Error(`Pack requires an active Pro license: ${packId}`);
  }

  const already = readPacksState(projectRoot).packs.find((p) => p.packId === packId);
  if (already) return { record: already };

  const record = installPackRecord(projectRoot, {
    packId,
    version: view.manifest.version,
  });
  notifyPacksChanged(projectRoot);
  return { record, suggestedOrchestrator: orchestratorSuggestion(projectRoot, view.manifest) };
}

/**
 * setEnabled（§6.2）：改 record.enabled。
 * - local：结构性不可禁用（它是用户自己的内容容器）；
 * - core / 隐式已装的 pack 无记录时按需补记录（否则整包禁用无处落）；
 * - 启用成功且满足条件时返回 §9.4 联动建议。
 */
export function setPackEnabledFlow(
  projectRoot: string,
  packId: string,
  enabled: boolean,
): PackMutationResult {
  if (packId === LOCAL_PACK_ID) {
    throw new Error("The Local Pack cannot be disabled.");
  }
  const manifest = manifestOf(packId);

  let record = setPackEnabled(projectRoot, packId, enabled);
  if (!record) {
    // core / installedByDefault 的 pack 没有 install 记录 → 补一条承载 enabled 态
    const catalogView = listPacks().find((p) => p.manifest.id === packId);
    if (!catalogView?.installedByDefault) {
      throw new Error(`Pack is not installed: ${packId}`);
    }
    const state = readPacksState(projectRoot);
    record = {
      packId,
      version: manifest.version,
      enabled,
      installedAt: new Date().toISOString(),
    };
    writePacksState(projectRoot, { ...state, packs: [...state.packs, record] });
  }
  notifyPacksChanged(projectRoot);
  return {
    record,
    suggestedOrchestrator: enabled ? orchestratorSuggestion(projectRoot, manifest) : undefined,
  };
}

/**
 * uninstall（§6.2）：移除记录 + 修剪 disabledContent / contentOverrides +
 * 默认 orchestrator 回退（均在 removePackRecord 内）。core / local 拒绝。
 * 未安装 → 幂等 no-op。
 */
export function uninstallPack(projectRoot: string, packId: string): void {
  if (packId === CORE_PACK_ID || packId === LOCAL_PACK_ID) {
    throw new Error(`Pack cannot be uninstalled: ${packId}`);
  }
  const installed = readPacksState(projectRoot).packs.some((p) => p.packId === packId);
  if (!installed) return;
  removePackRecord(projectRoot, packId);
  notifyPacksChanged(projectRoot);
}
