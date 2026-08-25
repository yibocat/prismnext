import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  LIBRARY_DIRNAME,
  PROJECT_META_DIR,
  PROJECTS_DIRNAME,
  WORKBENCH_HOME_DIRNAME,
  WORKBENCH_JSON_FILENAME,
  WORKTREES_DIRNAME,
  HOST_INSTALL_DIRNAME,
  REMOTE_CACHE_DIRNAME,
  hostCurrentRel,
  hostInstallRel,
  hostStampRel,
  libraryRel,
  projectSlotMetaRel,
  projectSlotRel,
  remoteCacheRel,
  workbenchJsonRel,
  worktreeCheckoutRel,
  worktreeSlotRel,
  isHomeWorktreeCheckoutPath,
  parseHomeWorktreeCheckoutPath,
} from "../../src/shared/workbench/paths";
import {
  HOME_BROWSER_DIRNAME,
  HOME_JOBS_DIRNAME,
  HOME_RUNTIME_SESSIONS_DIRNAME,
  HOME_SESSIONS_DIRNAME,
  HOME_SETTINGS_FILENAME,
  HOME_SKILLS_DIRNAME,
  HOME_TEAMS_DIRNAME,
} from "../../src/shared/workbench/paths";
import {
  ensureWorkbenchHome,
  findWorkbenchProjectRoot,
  isPathInsideWorkbenchHome,
  isWorkbenchHomePath,
  resolveWorkbenchHome,
  setWorkbenchUserHomeOverride,
} from "../../src/main/workbench/home";
import { findPrismProjectRoot } from "../../src/main/experiment/facade";
import { resolvePiAgentRoot, resolvePiRuntimeSessionDir } from "../../src/main/agent/session-store";
import { userTeamsRootDir } from "../../src/main/teams/user-teams";

const temps: string[] = [];

afterEach(() => {
  setWorkbenchUserHomeOverride(null);
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-home-"));
  temps.push(dir);
  return dir;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

describe("workbench-paths", () => {
  it("keeps project meta and workbench home as distinct names", () => {
    expect(PROJECT_META_DIR).toBe(".workbench");
    expect(WORKBENCH_HOME_DIRNAME).toBe(".prismnext");
    expect(PROJECT_META_DIR).not.toBe(WORKBENCH_HOME_DIRNAME);
  });

  it("builds posix-relative slot / library / worktree paths from id", () => {
    expect(workbenchJsonRel()).toBe(`${PROJECT_META_DIR}/${WORKBENCH_JSON_FILENAME}`);
    expect(projectSlotRel("p_abc")).toBe(`${PROJECTS_DIRNAME}/p_abc`);
    expect(projectSlotMetaRel("p_abc")).toBe(`${PROJECTS_DIRNAME}/p_abc/meta.json`);
    expect(libraryRel("p_abc")).toBe(`${PROJECTS_DIRNAME}/p_abc/${LIBRARY_DIRNAME}`);
    expect(worktreeSlotRel("p_abc", "wt1")).toBe(
      `${PROJECTS_DIRNAME}/p_abc/${WORKTREES_DIRNAME}/wt1`,
    );
    expect(worktreeCheckoutRel("p_abc", "wt1")).toBe(
      `${PROJECTS_DIRNAME}/p_abc/${WORKTREES_DIRNAME}/wt1/checkout`,
    );
    expect(libraryRel("p_abc")).not.toContain(".prismnext");
  });

  it("keeps Host install and remote cache off the paper-side .prismnext layout", () => {
    expect(HOST_INSTALL_DIRNAME).toBe(".prismnext-host");
    expect(REMOTE_CACHE_DIRNAME).toBe("remote-cache");
    expect(hostInstallRel()).toBe(".prismnext-host");
    expect(hostCurrentRel()).toBe(".prismnext-host/current");
    expect(hostStampRel()).toBe(".prismnext-host/current/stamp.json");
    expect(remoteCacheRel("ssh_1", "p_abc")).toBe("remote-cache/ssh_1/p_abc");
    expect(hostInstallRel()).not.toBe(".prismnext");
    expect(remoteCacheRel("ssh_1", "p_abc")).not.toContain(".prismnext");
  });

  it("parses home worktree checkout paths and rejects the old paper-side layout", () => {
    expect(
      parseHomeWorktreeCheckoutPath(
        "/Users/me/.prismnext/projects/p_abc/worktrees/calm-owl/checkout/src/main.tex",
      ),
    ).toEqual({ projectId: "p_abc", worktreeId: "calm-owl" });
    expect(isHomeWorktreeCheckoutPath("/Users/me/.prismnext/projects/p_abc/worktrees/calm-owl/checkout")).toBe(true);
    expect(isHomeWorktreeCheckoutPath("/Users/me/paper/.prismnext/worktrees/calm-owl")).toBe(false);
  });
});

describe("resolveWorkbenchHome", () => {
  it("joins the injected homeDir with the hidden workbench home name", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    expect(resolveWorkbenchHome({ homeDir: fakeHome })).toBe(
      path.resolve(fakeHome, WORKBENCH_HOME_DIRNAME).replace(/\\/g, "/").replace(/\/+$/, ""),
    );
  });
});

describe("isWorkbenchHomePath / isPathInsideWorkbenchHome", () => {
  it("treats the home itself as the home, not as a descendant", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const home = resolveWorkbenchHome({ homeDir: fakeHome });
    expect(isWorkbenchHomePath(home, { homeDir: fakeHome })).toBe(true);
    expect(isPathInsideWorkbenchHome(home, { homeDir: fakeHome })).toBe(false);
  });

  it("recognizes descendants of the workbench home", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const inside = path.join(fakeHome, WORKBENCH_HOME_DIRNAME, "sessions", "x.json");
    expect(isPathInsideWorkbenchHome(inside, { homeDir: fakeHome })).toBe(true);
    expect(isWorkbenchHomePath(inside, { homeDir: fakeHome })).toBe(false);
  });

  it("does not treat a similarly prefixed sibling as inside the home", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const sibling = path.join(fakeHome, `${WORKBENCH_HOME_DIRNAME}-backup`);
    expect(isPathInsideWorkbenchHome(sibling, { homeDir: fakeHome })).toBe(false);
    expect(isWorkbenchHomePath(sibling, { homeDir: fakeHome })).toBe(false);
  });
});

describe("findWorkbenchProjectRoot", () => {
  it("returns the folder that contains .workbench/workbench.json", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const project = path.join(fakeHome, "Documents", "paper");
    writeJson(path.join(project, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME), { id: "p_test" });

    const found = findWorkbenchProjectRoot(path.join(project, "src", "main.tex"), {
      homeDir: fakeHome,
    });
    expect(found).toBe(
      path.resolve(project).replace(/\\/g, "/").replace(/\/+$/, ""),
    );
  });

  it("does not treat a .workbench directory without workbench.json as a project", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const project = path.join(fakeHome, "Documents", "empty-meta");
    fs.mkdirSync(path.join(project, PROJECT_META_DIR), { recursive: true });

    expect(
      findWorkbenchProjectRoot(project, { homeDir: fakeHome }),
    ).toBeNull();
  });

  it("walks out of .workbench itself to the real project root", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const project = path.join(fakeHome, "Documents", "paper");
    writeJson(path.join(project, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME), { id: "p_test" });

    const found = findWorkbenchProjectRoot(path.join(project, PROJECT_META_DIR, "compile"), {
      homeDir: fakeHome,
    });
    expect(found).toBe(
      path.resolve(project).replace(/\\/g, "/").replace(/\/+$/, ""),
    );
  });

  it("never treats the workbench home as a project root, even if it has settings or a stray .workbench", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const home = resolveWorkbenchHome({ homeDir: fakeHome });
    writeJson(path.join(home, "settings.json"), { defaultProjectId: "p_x" });
    writeJson(path.join(home, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME), { id: "p_trap" });

    expect(findWorkbenchProjectRoot(home, { homeDir: fakeHome })).toBeNull();
    expect(
      findWorkbenchProjectRoot(path.join(home, "sessions"), { homeDir: fakeHome }),
    ).toBeNull();
    expect(
      findWorkbenchProjectRoot(path.join(home, PROJECT_META_DIR), { homeDir: fakeHome }),
    ).toBeNull();
  });
});

describe("ensureWorkbenchHome", () => {
  it("creates the home tree and a settings skeleton without clobbering an existing file", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    const home = ensureWorkbenchHome({ homeDir: fakeHome });
    expect(home).toBe(resolveWorkbenchHome({ homeDir: fakeHome }));
    for (const rel of [
      HOME_SESSIONS_DIRNAME,
      PROJECTS_DIRNAME,
      HOME_SKILLS_DIRNAME,
      HOME_TEAMS_DIRNAME,
      HOME_BROWSER_DIRNAME,
      HOME_JOBS_DIRNAME,
      HOME_RUNTIME_SESSIONS_DIRNAME,
    ]) {
      expect(fs.existsSync(path.join(home, rel))).toBe(true);
    }
    const settingsPath = path.join(home, HOME_SETTINGS_FILENAME);
    const first = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as {
      defaultProjectId: string | null;
      workbenchProjectIds: string[];
    };
    expect(first.defaultProjectId).toBeNull();
    expect(first.workbenchProjectIds).toEqual([]);

    fs.writeFileSync(settingsPath, JSON.stringify({ defaultProjectId: "p_keep" }), "utf-8");
    ensureWorkbenchHome({ homeDir: fakeHome });
    expect(JSON.parse(fs.readFileSync(settingsPath, "utf-8"))).toEqual({ defaultProjectId: "p_keep" });
  });
});

describe("findPrismProjectRoot — skip workbench home", () => {
  it("does not treat $HOME as a project just because ~/.prismnext exists", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    setWorkbenchUserHomeOverride(fakeHome);
    ensureWorkbenchHome({ homeDir: fakeHome });

    expect(findPrismProjectRoot(path.join(fakeHome, "Documents"))).toBeNull();
    expect(findPrismProjectRoot(resolveWorkbenchHome({ homeDir: fakeHome }))).toBeNull();
  });

  it("finds a paper folder by .workbench, not leftover .prismnext", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    setWorkbenchUserHomeOverride(fakeHome);
    ensureWorkbenchHome({ homeDir: fakeHome });
    const project = path.join(fakeHome, "Documents", "old-paper");
    fs.mkdirSync(path.join(project, WORKBENCH_HOME_DIRNAME), { recursive: true });
    expect(findPrismProjectRoot(path.join(project, "src"))).toBeNull();

    fs.mkdirSync(path.join(project, PROJECT_META_DIR), { recursive: true });
    expect(findPrismProjectRoot(path.join(project, "src"))).toBe(
      path.resolve(project).replace(/\\/g, "/").replace(/\/+$/, ""),
    );
  });
});

describe("session / team roots leave userData", () => {
  it("resolves the agent root and runtime sessions under the workbench home", () => {
    const fakeHome = path.join(tmpRoot(), "Users", "me");
    setWorkbenchUserHomeOverride(fakeHome);
    const home = resolveWorkbenchHome({ homeDir: fakeHome });
    expect(resolvePiAgentRoot()).toBe(home);
    expect(resolvePiAgentRoot()).not.toContain("pi-agent");
    expect(resolvePiRuntimeSessionDir()).toBe(path.join(home, HOME_RUNTIME_SESSIONS_DIRNAME).replace(/\\/g, "/"));
    expect(userTeamsRootDir().replace(/\\/g, "/")).toBe(
      path.join(home, HOME_TEAMS_DIRNAME).replace(/\\/g, "/"),
    );
  });
});
