import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PACKS_STATE_REL,
  installPackRecord,
  migratePacksStateIfNeeded,
  readPacksState,
  removePackRecord,
  saveContentOverride,
  setContentDisabled,
  setDefaultOrchestratorFqid,
  setPackEnabled,
  writePacksState,
} from "../../src/main/services/packs-state";
import { emptyPacksState, normalizePacksState } from "../../src/shared/packs/state";
import { PACKS_STATE_VERSION } from "../../src/shared/packs/types";
import { makeProjectRoot, makeTempDir } from "./packs-test-utils";

describe("packs-state: 读写", () => {
  it("文件不存在 → 空状态，且纯读不落盘", () => {
    const root = makeProjectRoot();
    const state = readPacksState(root);
    expect(state).toEqual(emptyPacksState());
    expect(existsSync(join(root, PACKS_STATE_REL))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("write → read 往返一致", () => {
    const root = makeProjectRoot();
    const state = emptyPacksState();
    state.defaultOrchestrator = "prismnext.core:research-prism";
    state.packs.push({
      packId: "test.pack",
      version: "0.1.0",
      enabled: true,
      installedAt: new Date().toISOString(),
    });
    writePacksState(root, state);
    expect(readPacksState(root)).toEqual(state);
    rmSync(root, { recursive: true, force: true });
  });

  it("原子写：不残留 .tmp 文件", () => {
    const root = makeProjectRoot();
    writePacksState(root, emptyPacksState());
    expect(existsSync(join(root, PACKS_STATE_REL))).toBe(true);
    expect(existsSync(join(root, `${PACKS_STATE_REL}.tmp`))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("损坏 JSON → 回退空状态", () => {
    const root = makeProjectRoot();
    writeFileSync(join(root, PACKS_STATE_REL), "{ not json", "utf-8");
    expect(readPacksState(root)).toEqual(emptyPacksState());
    rmSync(root, { recursive: true, force: true });
  });
});

describe("packs-state: §6.2 状态操作", () => {
  it("installPackRecord 追加记录；重复安装幂等 no-op", () => {
    const root = makeProjectRoot();
    const rec1 = installPackRecord(root, { packId: "test.pack", version: "0.1.0" });
    expect(rec1.enabled).toBe(true);
    const rec2 = installPackRecord(root, { packId: "test.pack", version: "0.2.0" });
    expect(rec2.installedAt).toBe(rec1.installedAt);
    expect(readPacksState(root).packs).toHaveLength(1);
    rmSync(root, { recursive: true, force: true });
  });

  it("setPackEnabled 改写；未知 packId 返回 null", () => {
    const root = makeProjectRoot();
    installPackRecord(root, { packId: "test.pack", version: "0.1.0" });
    expect(setPackEnabled(root, "test.pack", false)?.enabled).toBe(false);
    expect(readPacksState(root).packs[0].enabled).toBe(false);
    expect(setPackEnabled(root, "ghost.pack", true)).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("removePackRecord 修剪 disabledContent / overrides / 默认 orchestrator", () => {
    const root = makeProjectRoot();
    installPackRecord(root, { packId: "test.pack", version: "0.1.0" });
    installPackRecord(root, { packId: "other.pack", version: "0.1.0" });
    setContentDisabled(root, "test.pack:skill-a", true);
    setContentDisabled(root, "other.pack:skill-b", true);
    saveContentOverride(root, "test.pack:expert-x", { model: "m1" });
    setDefaultOrchestratorFqid(root, "test.pack:orch");

    const next = removePackRecord(root, "test.pack");
    expect(next.packs.map((p) => p.packId)).toEqual(["other.pack"]);
    expect(next.disabledContent).toEqual(["other.pack:skill-b"]);
    expect(next.contentOverrides).toEqual({});
    expect(next.defaultOrchestrator).toBe("prismnext.core:research-prism");
    rmSync(root, { recursive: true, force: true });
  });

  it("setContentDisabled 幂等且排序", () => {
    const root = makeProjectRoot();
    setContentDisabled(root, "p:b", true);
    setContentDisabled(root, "p:a", true);
    setContentDisabled(root, "p:a", true);
    expect(readPacksState(root).disabledContent).toEqual(["p:a", "p:b"]);
    setContentDisabled(root, "p:a", false);
    expect(readPacksState(root).disabledContent).toEqual(["p:b"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("saveContentOverride 增量合并；undefined 删字段；空对象删键", () => {
    const root = makeProjectRoot();
    saveContentOverride(root, "p:e", { model: "m1", temperature: 0.2 });
    saveContentOverride(root, "p:e", { temperature: 0.5 });
    expect(readPacksState(root).contentOverrides["p:e"]).toEqual({ model: "m1", temperature: 0.5 });
    saveContentOverride(root, "p:e", { model: undefined, temperature: undefined });
    expect(readPacksState(root).contentOverrides["p:e"]).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("packs-state: 迁移框架（空转）", () => {
  it("旧 stateVersion → 重写为当前版本；二次调用不再迁移", () => {
    const root = makeProjectRoot();
    writeFileSync(
      join(root, PACKS_STATE_REL),
      JSON.stringify({ stateVersion: 1, packs: [] }, null, 2),
      "utf-8",
    );
    const first = migratePacksStateIfNeeded(root);
    expect(first.migrated).toBe(true);
    expect(first.state.stateVersion).toBe(PACKS_STATE_VERSION);

    const second = migratePacksStateIfNeeded(root);
    expect(second.migrated).toBe(false);

    const onDisk = JSON.parse(readFileSync(join(root, PACKS_STATE_REL), "utf-8"));
    expect(onDisk.stateVersion).toBe(PACKS_STATE_VERSION);
    rmSync(root, { recursive: true, force: true });
  });

  it("文件不存在 → migrated=false 且不落盘", () => {
    const root = makeTempDir("packs-noproj-");
    const result = migratePacksStateIfNeeded(root);
    expect(result.migrated).toBe(false);
    expect(existsSync(join(root, PACKS_STATE_REL))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("shared/packs/state: normalizePacksState 防御", () => {
  it("过滤畸形字段", () => {
    const state = normalizePacksState({
      stateVersion: 99,
      defaultOrchestrator: "not-an-fqid",
      packs: [
        { packId: "ok.pack", version: 1, enabled: true },
        { packId: "" },
        "garbage",
      ],
      disabledContent: ["ok.pack:x", "no-colon", 42],
      contentOverrides: {
        "ok.pack:e": { model: "m" },
        "bad-key": { model: "m" },
        "ok.pack:array": [1, 2],
      },
    });
    expect(state.stateVersion).toBe(PACKS_STATE_VERSION);
    expect(state.defaultOrchestrator).toBeUndefined();
    expect(state.packs).toHaveLength(1);
    expect(state.packs[0].version).toBe("0.0.0");
    expect(state.disabledContent).toEqual(["ok.pack:x"]);
    expect(Object.keys(state.contentOverrides)).toEqual(["ok.pack:e"]);
  });
});
