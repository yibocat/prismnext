import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PACKS_STATE_REL,
  getPackProjectState,
  migratePacksStateIfNeeded,
  readPacksState,
  removePackProjectState,
  saveContentOverride,
  setContentDisabled,
  setDefaultOrchestratorFqid,
  setPackEnabled,
  writePacksState,
} from "../../src/main/services/packs-state";
import {
  listInstalledPacks,
  setPacksInstalledDataDir,
} from "../../src/main/services/packs-installed";
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
    state.projectPackStates = { "test.pack": { enabled: false } };
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

describe("packs-state: §6.2 状态操作（layering）", () => {
  it("setPackEnabled(false) 写覆盖；再设 true 删键（缺省自动启用）", () => {
    const root = makeProjectRoot();
    setPackEnabled(root, "test.pack", false);
    expect(getPackProjectState(root, "test.pack")).toEqual({ enabled: false });
    setPackEnabled(root, "test.pack", true);
    expect(getPackProjectState(root, "test.pack")).toBeNull();
    expect(readPacksState(root).projectPackStates).toEqual({});
    rmSync(root, { recursive: true, force: true });
  });

  it("getPackProjectState 无记录 → null", () => {
    const root = makeProjectRoot();
    expect(getPackProjectState(root, "ghost.pack")).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("removePackProjectState 修剪覆盖 / disabledContent / overrides / 默认 orchestrator", () => {
    const root = makeProjectRoot();
    setPackEnabled(root, "test.pack", false);
    setPackEnabled(root, "other.pack", false);
    setContentDisabled(root, "test.pack:skill-a", true);
    setContentDisabled(root, "other.pack:skill-b", true);
    saveContentOverride(root, "test.pack:expert-x", { model: "m1" });
    setDefaultOrchestratorFqid(root, "test.pack:orch");

    const next = removePackProjectState(root, "test.pack");
    expect(Object.keys(next.projectPackStates)).toEqual(["other.pack"]);
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

  it("v2 → v3：packs[] 上卷到应用级 + enabled=false 映射 projectPackStates", () => {
    // Seal the app-level store into a temp dir so we can assert the upsert.
    const appDir = makeTempDir("packs-app-");
    setPacksInstalledDataDir(appDir);
    try {
      const root = makeProjectRoot();
      writeFileSync(
        join(root, PACKS_STATE_REL),
        JSON.stringify(
          {
            stateVersion: 2,
            defaultOrchestrator: "prismnext.core:research-prism",
            packs: [
              { packId: "test.notes", version: "0.1.0", enabled: true, installedAt: "2026-01-01T00:00:00.000Z" },
              { packId: "test.peer", version: "0.2.0", enabled: false, installedAt: "2026-01-02T00:00:00.000Z" },
            ],
            disabledContent: [],
            contentOverrides: {},
          },
          null,
          2,
        ),
        "utf-8",
      );

      const first = migratePacksStateIfNeeded(root);
      expect(first.migrated).toBe(true);
      expect(first.state.stateVersion).toBe(PACKS_STATE_VERSION);
      expect(first.state.projectPackStates).toEqual({ "test.peer": { enabled: false } });
      expect(Object.keys(first.state.projectPackStates)).not.toContain("test.notes");

      const installed = listInstalledPacks().map((r) => r.packId);
      expect(installed).toContain("test.notes");
      expect(installed).toContain("test.peer");

      const second = migratePacksStateIfNeeded(root);
      expect(second.migrated).toBe(false);
      expect(listInstalledPacks().map((r) => r.packId)).toEqual(installed);

      rmSync(root, { recursive: true, force: true });
    } finally {
      setPacksInstalledDataDir(null);
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});

describe("shared/packs/state: normalizePacksState 防御", () => {
  it("过滤畸形字段", () => {
    const state = normalizePacksState({
      stateVersion: 99,
      defaultOrchestrator: "not-an-fqid",
      projectPackStates: {
        "ok.pack": { enabled: false },
        "bad.pack": { enabled: "yes" },
        "other.pack": "garbage",
      },
      disabledContent: ["ok.pack:x", "no-colon", 42],
      contentOverrides: {
        "ok.pack:e": { model: "m" },
        "bad-key": { model: "m" },
        "ok.pack:array": [1, 2],
      },
    });
    expect(state.stateVersion).toBe(PACKS_STATE_VERSION);
    expect(state.defaultOrchestrator).toBeUndefined();
    expect(Object.keys(state.projectPackStates)).toEqual(["ok.pack"]);
    expect(state.disabledContent).toEqual(["ok.pack:x"]);
    expect(Object.keys(state.contentOverrides)).toEqual(["ok.pack:e"]);
  });
});
