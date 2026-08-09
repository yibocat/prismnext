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
 * 每个变更操作末尾统一 notifyTeamsChanged（resolver 失效 + experts/skills
 * OpenCode 再同步，§5.5）。
 */

import {
  CORE_TEAM_ID,
  DEFAULT_ORCHESTRATOR_FQID,
  LOCAL_TEAM_ID,
  USER_TEAM_PUBLISHER,
  type Fqid,
  type TeamManifest,
} from "../../shared/teams/types";
import { toFqid as _toFqid, fqidBelongsToPack } from "../../shared/teams/state";
import { getTeam } from "./team-catalog";
import { getAsset, notifyTeamsChanged } from "./team-resolver";
import {
  addInstalledTeam,
  isTeamInstalled,
  removeInstalledTeam,
} from "./teams-installed";
import {
  getTeamProjectState,
  readTeamsState,
  removeTeamProjectState,
  setDefaultOrchestratorFqid,
  setTeamEnabled,
} from "./teams-state";
import { licenseGrants } from "./teams-license";

export interface TeamMutationResult {
  /** App-level install was applied (true) or already present (false). */
  applied?: boolean;
  /** §9.4：建议设为默认的 orchestrator FQID（无建议 → undefined） */
  suggestedOrchestrator?: Fqid;
  /** 关闭 pack 时，原默认主 agent 属于该 pack → 已转移回 core 默认（UI 提示用） */
  defaultMovedTo?: Fqid;
}

function manifestOf(teamId: string): TeamManifest {
  const view = getTeam(teamId);
  if (!view) throw new Error(`Pack not found in catalog: ${teamId}`);
  return view.manifest;
}

/** §9.4：pack 声明了 preferredOrchestrator 且项目默认仍是 core 默认 → 给出建议 */
function orchestratorSuggestion(projectRoot: string, manifest: TeamManifest): Fqid | undefined {
  const preferred = manifest.preferredOrchestrator?.trim();
  if (!preferred) return undefined;
  const current = readTeamsState(projectRoot).defaultOrchestrator;
  if (current && current !== DEFAULT_ORCHESTRATOR_FQID) return undefined;
  const fqid = _toFqid(manifest.id, preferred);
  const content = getAsset(projectRoot, fqid);
  if (!content || content.kind !== "orchestrator" || !content.enabled) return undefined;
  return fqid;
}

/**
 * install（layering spec §5.1）：校验（存在/兼容/tier 门）→ 应用级 installedPacks
 * 追加记录（所有项目可见）。已装 → 幂等（不重复通知）。校验失败一律抛错。
 */
export function installTeam(projectRoot: string, teamId: string): TeamMutationResult {
  const view = getTeam(teamId);
  if (!view) throw new Error(`Pack not found in catalog: ${teamId}`);
  if (!view.compatible) {
    throw new Error(`Pack is incompatible with this app version: ${teamId}`);
  }
  if (view.manifest.tier === "pro" && !licenseGrants(view.manifest.feature)) {
    throw new Error(`Pack requires an active Pro license: ${teamId}`);
  }

  const already = isTeamInstalled(teamId);
  addInstalledTeam(teamId);
  notifyTeamsChanged(projectRoot);
  return {
    applied: !already,
    suggestedOrchestrator: orchestratorSuggestion(projectRoot, view.manifest),
  };
}

/**
 * setEnabled（§6.2）：改 record.enabled。
 * - local：结构性不可禁用（它是用户自己的内容容器）；
 * - core / 隐式已装的 pack 无记录时按需补记录（否则整包禁用无处落）；
 * - 启用成功且满足条件时返回 §9.4 联动建议；
 * - 停用 pack 时若默认主 agent 属于该 pack，默认自动转移回 core 默认
 *   （否则本项目聊天会落到一个被禁用的 agent 上；UI 用 defaultMovedTo 提示）。
 */
export function setTeamEnabledFlow(
  projectRoot: string,
  teamId: string,
  enabled: boolean,
): TeamMutationResult {
  if (teamId === LOCAL_TEAM_ID) {
    throw new Error("The Local Pack cannot be disabled.");
  }
  const manifest = manifestOf(teamId);

  // Project-level override only; install state lives at app level.
  setTeamEnabled(projectRoot, teamId, enabled);

  // Disabling a pack that owns the current default main agent → move the
  // default to the core fallback so chat keeps a live agent. Must run after
  // setTeamEnabled so the resolver view reflects the disabled pack.
  let defaultMovedTo: Fqid | undefined;
  if (!enabled) {
    const current = readTeamsState(projectRoot).defaultOrchestrator;
    if (current && fqidBelongsToPack(current, teamId)) {
      setDefaultOrchestratorFqid(projectRoot, DEFAULT_ORCHESTRATOR_FQID);
      defaultMovedTo = DEFAULT_ORCHESTRATOR_FQID;
    }
  }

  notifyTeamsChanged(projectRoot);
  return {
    suggestedOrchestrator: enabled ? orchestratorSuggestion(projectRoot, manifest) : undefined,
    defaultMovedTo,
  };
}

/**
 * uninstall（layering spec §5.1）：应用级移除记录 + 项目侧修剪
 * projectPackStates / disabledContent / contentOverrides / 默认 orchestrator 回退。
 * core / local 拒绝。未安装 → 幂等 no-op。
 */
export function uninstallTeam(projectRoot: string, teamId: string): void {
  if (teamId === CORE_TEAM_ID || teamId === LOCAL_TEAM_ID) {
    throw new Error(`Pack cannot be uninstalled: ${teamId}`);
  }
  // User-created teams are deleted via the user-packs surface, not uninstalled.
  if (manifestOf(teamId).publisher === USER_TEAM_PUBLISHER) {
    throw new Error("User-created teams are deleted, not uninstalled.");
  }
  const installed = isTeamInstalled(teamId);
  if (!installed) return;
  removeInstalledTeam(teamId);
  removeTeamProjectState(projectRoot, teamId);
  notifyTeamsChanged(projectRoot);
}
