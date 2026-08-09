/**
 * packs-lifecycle 测试（§6.2 校验层 + §9.4 联动建议）。
 * 测试密封（packs-test-utils）：fake core / free / pro pack 走 external roots。
 */
import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import {
  installPack,
  setPackEnabledFlow,
  uninstallPack,
} from "../../src/main/services/packs-lifecycle";
import {
  listExternalPackRoots,
  registerExternalPackRoot,
  unregisterExternalPackRoot,
} from "../../src/main/services/pack-catalog";
import { isContentActive, resolveOrchestratorId } from "../../src/main/services/pack-resolver";
import {
  isPackInstalled,
  setPacksInstalledDataDir,
} from "../../src/main/services/packs-installed";
import {
  getPackProjectState,
  readPacksState,
  setContentDisabled,
  setDefaultOrchestratorFqid,
} from "../../src/main/services/packs-state";
import { CORE_PACK_ID, DEFAULT_ORCHESTRATOR_FQID, LOCAL_PACK_ID } from "../../src/shared/packs/types";
import { baseManifest, makePack, makeProjectRoot, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

function project(): string {
  const root = makeProjectRoot();
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of listExternalPackRoots()) unregisterExternalPackRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setPacksInstalledDataDir(null);
});

/** Seal the app-level installed store into a per-test temp dir. */
function sealAppStore(): string {
  const dir = makeTempDir("packs-app-");
  setPacksInstalledDataDir(dir);
  tempDirs.push(dir);
  return dir;
}

function setupPacks(): void {
  const coreRoot = temp();
  makePack(coreRoot, "prismnext.core", baseManifest(CORE_PACK_ID, { publisher: "prismnext" }), {
    orchestrators: [{ id: "research-prism" }],
  });
  registerExternalPackRoot(coreRoot);

  const notesRoot = temp();
  makePack(
    notesRoot,
    "test.notes",
    baseManifest("test.notes", { name: "Notes", preferredOrchestrator: "notes-lead" }),
    {
      orchestrators: [{ id: "notes-lead" }],
      experts: [{ id: "reading-coach" }],
    },
  );
  registerExternalPackRoot(notesRoot);

  const proRoot = temp();
  makePack(
    proRoot,
    "test.pro",
    baseManifest("test.pro", { tier: "pro", publisher: "prismnext.pro" }),
    { experts: [{ id: "pro-expert" }] },
  );
  registerExternalPackRoot(proRoot);
}

describe("packs-lifecycle: install（应用级 + §9.4 建议）", () => {
  it("install 成功：应用级记录 + 项目自动启用；声明 preferredOrchestrator 且默认未定制 → 建议", () => {
    setupPacks();
    sealAppStore();
    const root = project();

    const { applied, suggestedOrchestrator } = installPack(root, "test.notes");
    expect(applied).toBe(true);
    expect(isPackInstalled("test.notes")).toBe(true);
    expect(suggestedOrchestrator).toBe("test.notes:notes-lead");
    expect(isContentActive(root, "test.notes:notes-lead")).toBe(true);

    // 幂等：重复 install applied=false；默认 orchestrator 仍为 core 默认 → 建议照给
    const again = installPack(root, "test.notes");
    expect(again.applied).toBe(false);
    expect(again.suggestedOrchestrator).toBe("test.notes:notes-lead");
  });

  it("默认 orchestrator 已定制 → 不给联动建议", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    setDefaultOrchestratorFqid(root, "user.local:my-lead");

    const { suggestedOrchestrator } = installPack(root, "test.notes");
    expect(suggestedOrchestrator).toBeUndefined();
  });

  it("catalog 不存在 / pro 未授权 → 抛错，不写应用级记录", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    expect(() => installPack(root, "ghost.pack")).toThrow(/not found/i);
    expect(() => installPack(root, "test.pro")).toThrow(/pro license/i);
    expect(isPackInstalled("test.notes")).toBe(false);
  });
});

describe("packs-lifecycle: setEnabled / uninstall（分层）", () => {
  it("core 整包禁用：写 projectPackStates；可恢复（删键）", () => {
    setupPacks();
    sealAppStore();
    const root = project();

    setPackEnabledFlow(root, CORE_PACK_ID, false);
    expect(getPackProjectState(root, CORE_PACK_ID)).toEqual({ enabled: false });
    expect(isContentActive(root, `${CORE_PACK_ID}:research-prism`)).toBe(false);

    setPackEnabledFlow(root, CORE_PACK_ID, true);
    expect(getPackProjectState(root, CORE_PACK_ID)).toBeNull();
    expect(isContentActive(root, `${CORE_PACK_ID}:research-prism`)).toBe(true);
  });

  it("local 不可禁用", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    expect(() => setPackEnabledFlow(root, LOCAL_PACK_ID, false)).toThrow(/local/i);
  });

  it("禁用拥有默认主 agent 的 pack → 默认自动转移回 core，并返回 defaultMovedTo", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    installPack(root, "test.notes");
    setDefaultOrchestratorFqid(root, "test.notes:notes-lead");
    expect(readPacksState(root).defaultOrchestrator).toBe("test.notes:notes-lead");

    const result = setPackEnabledFlow(root, "test.notes", false);
    expect(result.defaultMovedTo).toBe(DEFAULT_ORCHESTRATOR_FQID);
    expect(readPacksState(root).defaultOrchestrator).toBe(DEFAULT_ORCHESTRATOR_FQID);
    // 实际生效的默认也回到 core（聊天不会落到被禁用的 agent 上）
    expect(resolveOrchestratorId(root)).toBe(DEFAULT_ORCHESTRATOR_FQID);

    // 重新启用 → defaultMovedTo 不出现，默认保持 core
    const re = setPackEnabledFlow(root, "test.notes", true);
    expect(re.defaultMovedTo).toBeUndefined();
    expect(readPacksState(root).defaultOrchestrator).toBe(DEFAULT_ORCHESTRATOR_FQID);
  });

  it("uninstall：core/local 拒绝；应用级移除 + 项目侧修剪 + 默认回退", () => {
    setupPacks();
    sealAppStore();
    const root = project();
    expect(() => uninstallPack(root, CORE_PACK_ID)).toThrow(/cannot be uninstalled/i);
    expect(() => uninstallPack(root, LOCAL_PACK_ID)).toThrow(/cannot be uninstalled/i);
    // 未安装 → 幂等 no-op
    expect(() => uninstallPack(root, "test.notes")).not.toThrow();

    installPack(root, "test.notes");
    expect(isPackInstalled("test.notes")).toBe(true);
    setContentDisabled(root, "test.notes:reading-coach", true);
    setDefaultOrchestratorFqid(root, "test.notes:notes-lead");

    uninstallPack(root, "test.notes");
    expect(isPackInstalled("test.notes")).toBe(false);
    const state = readPacksState(root);
    expect(state.disabledContent).toEqual([]);
    expect(state.defaultOrchestrator).toBe(DEFAULT_ORCHESTRATOR_FQID);
  });
});
