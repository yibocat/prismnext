import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  TEAMS_STATE_REL,
  getTeamProjectState,
  migrateTeamsStateIfNeeded,
  readTeamsState,
  removeTeamProjectState,
  saveAssetOverride,
  setAssetDisabled,
  setDefaultOrchestratorFqid,
  setTeamEnabled,
  writeTeamsState,
} from "../../src/main/services/teams-state";
import {
  listInstalledTeams,
  setTeamsInstalledDataDir,
} from "../../src/main/services/teams-installed";
import { emptyPacksState, normalizePacksState } from "../../src/shared/teams/state";
import { TEAMS_STATE_VERSION } from "../../src/shared/teams/types";
import { makeProjectRoot, makeTempDir } from "./packs-test-utils";

describe("packs-state: 读写", () => {
  it("文件不存在 → 空状态，且纯读不落盘", () => {
    const root = makeProjectRoot();
    const state = readTeamsState(root);
    expect(state).toEqual(emptyPacksState());
    expect(existsSync(join(root, TEAMS_STATE_REL))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("write → read 往返一致", () => {
    const root = makeProjectRoot();
    const state = emptyPacksState();
    state.defaultOrchestrator = "prismnext.core:research-prism";
    state.projectPackStates = { "test.pack": { enabled: false } };
    writeTeamsState(root, state);
    expect(readTeamsState(root)).toEqual(state);
    rmSync(root, { recursive: true, force: true });
  });

  it("原子写：不残留 .tmp 文件", () => {
    const root = makeProjectRoot();
    writeTeamsState(root, emptyPacksState());
    expect(existsSync(join(root, TEAMS_STATE_REL))).toBe(true);
    expect(existsSync(join(root, `${TEAMS_STATE_REL}.tmp`))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("损坏 JSON → 回退空状态", () => {
    const root = makeProjectRoot();
    writeFileSync(join(root, TEAMS_STATE_REL), "{ not json", "utf-8");
    expect(readTeamsState(root)).toEqual(emptyPacksState());
    rmSync(root, { recursive: true, force: true });
  });
});

describe("packs-state: §6.2 状态操作（layering）", () => {
  it("setTeamEnabled(false) 写覆盖；再设 true 删键（缺省自动启用）", () => {
    const root = makeProjectRoot();
    setTeamEnabled(root, "test.pack", false);
    expect(getTeamProjectState(root, "test.pack")).toEqual({ enabled: false });
    setTeamEnabled(root, "test.pack", true);
    expect(getTeamProjectState(root, "test.pack")).toBeNull();
    expect(readTeamsState(root).projectPackStates).toEqual({});
    rmSync(root, { recursive: true, force: true });
  });

  it("getTeamProjectState 无记录 → null", () => {
    const root = makeProjectRoot();
    expect(getTeamProjectState(root, "ghost.pack")).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it("removeTeamProjectState 修剪覆盖 / disabledContent / overrides / 默认 orchestrator", () => {
    const root = makeProjectRoot();
    setTeamEnabled(root, "test.pack", false);
    setTeamEnabled(root, "other.pack", false);
    setAssetDisabled(root, "test.pack:skill-a", true);
    setAssetDisabled(root, "other.pack:skill-b", true);
    saveAssetOverride(root, "test.pack:expert-x", { model: "m1" });
    setDefaultOrchestratorFqid(root, "test.pack:orch");

    const next = removeTeamProjectState(root, "test.pack");
    expect(Object.keys(next.projectPackStates)).toEqual(["other.pack"]);
    expect(next.disabledContent).toEqual(["other.pack:skill-b"]);
    expect(next.contentOverrides).toEqual({});
    expect(next.defaultOrchestrator).toBe("prismnext.core:research-prism");
    rmSync(root, { recursive: true, force: true });
  });

  it("setAssetDisabled 幂等且排序", () => {
    const root = makeProjectRoot();
    setAssetDisabled(root, "p:b", true);
    setAssetDisabled(root, "p:a", true);
    setAssetDisabled(root, "p:a", true);
    expect(readTeamsState(root).disabledContent).toEqual(["p:a", "p:b"]);
    setAssetDisabled(root, "p:a", false);
    expect(readTeamsState(root).disabledContent).toEqual(["p:b"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("saveAssetOverride 增量合并；undefined 删字段；空对象删键", () => {
    const root = makeProjectRoot();
    saveAssetOverride(root, "p:e", { model: "m1", temperature: 0.2 });
    saveAssetOverride(root, "p:e", { temperature: 0.5 });
    expect(readTeamsState(root).contentOverrides["p:e"]).toEqual({ model: "m1", temperature: 0.5 });
    saveAssetOverride(root, "p:e", { model: undefined, temperature: undefined });
    expect(readTeamsState(root).contentOverrides["p:e"]).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("packs-state: 迁移框架（空转）", () => {
  it("旧 stateVersion → 重写为当前版本；二次调用不再迁移", () => {
    const root = makeProjectRoot();
    writeFileSync(
      join(root, TEAMS_STATE_REL),
      JSON.stringify({ stateVersion: 1, packs: [] }, null, 2),
      "utf-8",
    );
    const first = migrateTeamsStateIfNeeded(root);
    expect(first.migrated).toBe(true);
    expect(first.state.stateVersion).toBe(TEAMS_STATE_VERSION);

    const second = migrateTeamsStateIfNeeded(root);
    expect(second.migrated).toBe(false);

    const onDisk = JSON.parse(readFileSync(join(root, TEAMS_STATE_REL), "utf-8"));
    expect(onDisk.stateVersion).toBe(TEAMS_STATE_VERSION);
    rmSync(root, { recursive: true, force: true });
  });

  it("文件不存在 → migrated=false 且不落盘", () => {
    const root = makeTempDir("packs-noproj-");
    const result = migrateTeamsStateIfNeeded(root);
    expect(result.migrated).toBe(false);
    expect(existsSync(join(root, TEAMS_STATE_REL))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("v2 → v3：packs[] 上卷到应用级 + enabled=false 映射 projectPackStates", () => {
    // Seal the app-level store into a temp dir so we can assert the upsert.
    const appDir = makeTempDir("packs-app-");
    setTeamsInstalledDataDir(appDir);
    try {
      const root = makeProjectRoot();
      writeFileSync(
        join(root, TEAMS_STATE_REL),
        JSON.stringify(
          {
            stateVersion: 2,
            defaultOrchestrator: "prismnext.core:research-prism",
            packs: [
              { teamId: "test.notes", version: "0.1.0", enabled: true, installedAt: "2026-01-01T00:00:00.000Z" },
              { teamId: "test.peer", version: "0.2.0", enabled: false, installedAt: "2026-01-02T00:00:00.000Z" },
            ],
            disabledContent: [],
            contentOverrides: {},
          },
          null,
          2,
        ),
        "utf-8",
      );

      const first = migrateTeamsStateIfNeeded(root);
      expect(first.migrated).toBe(true);
      expect(first.state.stateVersion).toBe(TEAMS_STATE_VERSION);
      expect(first.state.projectPackStates).toEqual({ "test.peer": { enabled: false } });
      expect(Object.keys(first.state.projectPackStates)).not.toContain("test.notes");

      const installed = listInstalledTeams().map((r) => r.teamId);
      expect(installed).toContain("test.notes");
      expect(installed).toContain("test.peer");

      const second = migrateTeamsStateIfNeeded(root);
      expect(second.migrated).toBe(false);
      expect(listInstalledTeams().map((r) => r.teamId)).toEqual(installed);

      rmSync(root, { recursive: true, force: true });
    } finally {
      setTeamsInstalledDataDir(null);
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});

describe("shared/teams/state: normalizePacksState 防御", () => {
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
    expect(state.stateVersion).toBe(TEAMS_STATE_VERSION);
    expect(state.defaultOrchestrator).toBeUndefined();
    expect(Object.keys(state.projectPackStates)).toEqual(["ok.pack"]);
    expect(state.disabledContent).toEqual(["ok.pack:x"]);
    expect(Object.keys(state.contentOverrides)).toEqual(["ok.pack:e"]);
  });
});
