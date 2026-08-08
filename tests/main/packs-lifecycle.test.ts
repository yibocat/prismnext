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
import { isContentActive } from "../../src/main/services/pack-resolver";
import {
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
});

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

describe("packs-lifecycle: install（§6.2 校验 + §9.4 建议）", () => {
  it("install 成功：追加 enabled 记录；声明 preferredOrchestrator 且默认未定制 → 返回建议", () => {
    setupPacks();
    const root = project();

    const { record, suggestedOrchestrator } = installPack(root, "test.notes");
    expect(record.packId).toBe("test.notes");
    expect(record.enabled).toBe(true);
    expect(suggestedOrchestrator).toBe("test.notes:notes-lead");
    expect(isContentActive(root, "test.notes:notes-lead")).toBe(true);

    // 幂等：重复 install 返回原记录，不再给建议
    const again = installPack(root, "test.notes");
    expect(again.record).toEqual(record);
    expect(again.suggestedOrchestrator).toBeUndefined();
    expect(readPacksState(root).packs.filter((p) => p.packId === "test.notes")).toHaveLength(1);
  });

  it("默认 orchestrator 已定制 → 不给联动建议", () => {
    setupPacks();
    const root = project();
    setDefaultOrchestratorFqid(root, "user.local:my-lead");

    const { suggestedOrchestrator } = installPack(root, "test.notes");
    expect(suggestedOrchestrator).toBeUndefined();
  });

  it("catalog 不存在 / pro 未授权 → 抛错", () => {
    setupPacks();
    const root = project();
    expect(() => installPack(root, "ghost.pack")).toThrow(/not found/i);
    expect(() => installPack(root, "test.pro")).toThrow(/pro license/i);
  });
});

describe("packs-lifecycle: setEnabled / uninstall", () => {
  it("core 整包禁用：无记录时补记录承载 enabled=false；可恢复", () => {
    setupPacks();
    const root = project();

    const off = setPackEnabledFlow(root, CORE_PACK_ID, false);
    expect(off.record.enabled).toBe(false);
    expect(isContentActive(root, `${CORE_PACK_ID}:research-prism`)).toBe(false);

    const on = setPackEnabledFlow(root, CORE_PACK_ID, true);
    expect(on.record.enabled).toBe(true);
    expect(isContentActive(root, `${CORE_PACK_ID}:research-prism`)).toBe(true);
  });

  it("local 不可禁用；未安装的 pack 不可启停", () => {
    setupPacks();
    const root = project();
    expect(() => setPackEnabledFlow(root, LOCAL_PACK_ID, false)).toThrow(/local/i);
    expect(() => setPackEnabledFlow(root, "test.notes", false)).toThrow(/not installed/i);
  });

  it("uninstall：core/local 拒绝；普通 pack 移除记录 + 修剪 disabledContent + 默认回退", () => {
    setupPacks();
    const root = project();
    expect(() => uninstallPack(root, CORE_PACK_ID)).toThrow(/cannot be uninstalled/i);
    expect(() => uninstallPack(root, LOCAL_PACK_ID)).toThrow(/cannot be uninstalled/i);
    // 未安装 → 幂等 no-op
    expect(() => uninstallPack(root, "test.notes")).not.toThrow();

    installPack(root, "test.notes");
    setContentDisabled(root, "test.notes:reading-coach", true);
    setDefaultOrchestratorFqid(root, "test.notes:notes-lead");

    uninstallPack(root, "test.notes");
    const state = readPacksState(root);
    expect(state.packs.some((p) => p.packId === "test.notes")).toBe(false);
    expect(state.disabledContent).toEqual([]);
    expect(state.defaultOrchestrator).toBe(DEFAULT_ORCHESTRATOR_FQID);
  });
});
