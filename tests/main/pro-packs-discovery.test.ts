import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverAndRegisterProTeams,
  findProPackageDirUp,
  handleProLicenseChanged,
  resolveTeamsRootDir,
  resolveProPackageDir,
} from "../../src/main/teams/pro-teams-discovery";
import {
  getTeamRecord,
  listExternalTeamRoots,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { licenseStateVersion } from "../../src/main/teams/teams-license";
import { baseManifest, makePack, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];
const savedEnv = process.env.PRISM_PRO_PATH;

function temp(): string {
  const dir = makeTempDir("pro-discovery-test-");
  tempDirs.push(dir);
  return dir;
}

/** 构造一个 pro 包布局：package.json + src/index.ts + teamsRoot/ */
function makeProPackage(
  root: string,
  opts: { teamsRoot?: string; withPrismnextField?: boolean } = {},
): { packageDir: string; entryFile: string; packsDir: string } {
  const packageDir = join(root, "pro-pkg");
  const packsRootName = opts.teamsRoot ?? "packs";
  mkdirSync(join(packageDir, "src"), { recursive: true });
  const pkg: Record<string, unknown> = { name: "@prismnext/pro", private: true };
  if (opts.withPrismnextField !== false) {
    pkg.prismnext = opts.teamsRoot
      ? { teamsRoot: packsRootName }
      : { packsRoot: packsRootName };
  }
  writeFileSync(join(packageDir, "package.json"), JSON.stringify(pkg, null, 2));
  const entryFile = join(packageDir, "src", "index.ts");
  writeFileSync(entryFile, "export {};\n");
  const packsDir = join(packageDir, packsRootName);
  mkdirSync(packsDir, { recursive: true });
  return { packageDir, entryFile, packsDir };
}

afterEach(() => {
  // 还原 env 并清空 discovery 的模块级注册记忆（跑一轮空 discovery 注销差量）
  if (savedEnv === undefined) delete process.env.PRISM_PRO_PATH;
  else process.env.PRISM_PRO_PATH = savedEnv;
  delete process.env.PRISM_PRO_PATH;
  discoverAndRegisterProTeams();
  for (const dir of listExternalTeamRoots()) unregisterExternalTeamRoot(dir);
  __resetTeamsResolverForTests();
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("pro-packs-discovery: 路径解析", () => {
  it("PRISM_PRO_PATH 指向包内文件（src/index.ts）→ 向上找到包目录", () => {
    const root = temp();
    const { packageDir, entryFile } = makeProPackage(root);
    expect(findProPackageDirUp(entryFile)).toBe(packageDir);
    expect(resolveProPackageDir(entryFile)).toBe(packageDir);
  });

  it("PRISM_PRO_PATH 指向包根目录 → 直接命中", () => {
    const root = temp();
    const { packageDir } = makeProPackage(root);
    expect(findProPackageDirUp(packageDir)).toBe(packageDir);
  });

  it("路径不存在 → null；env 为空且非 packaged → null", () => {
    expect(findProPackageDirUp(join(temp(), "nope", "index.ts"))).toBeNull();
    expect(resolveProPackageDir(undefined)).toBeNull();
    expect(resolveProPackageDir("")).toBeNull();
  });

  it("package.json 无 prismnext 字段但有 packs/ 目录 → 仍视为 pro 包", () => {
    const root = temp();
    const { packageDir } = makeProPackage(root, { withPrismnextField: false });
    expect(findProPackageDirUp(packageDir)).toBe(packageDir);
  });
});

describe("pro-packs-discovery: teamsRoot 解析", () => {
  it("默认 teamsRoot = packs；自定义 teamsRoot 生效", () => {
    const root = temp();
    const a = makeProPackage(join(root, "a"), { withPrismnextField: false });
    expect(resolveTeamsRootDir(a.packageDir)).toBe(a.packsDir);
    const b = makeProPackage(join(root, "b"), { teamsRoot: "suites" });
    expect(resolveTeamsRootDir(b.packageDir)).toBe(b.packsDir);
  });

  it("teamsRoot 逃逸包目录（../）→ null；目录不存在 → null", () => {
    const root = temp();
    const packageDir = join(root, "evil");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "evil", prismnext: { teamsRoot: "../outside" } }),
    );
    expect(resolveTeamsRootDir(packageDir)).toBeNull();

    const empty = join(root, "empty-pkg");
    mkdirSync(empty, { recursive: true });
    writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "x" }));
    expect(resolveTeamsRootDir(empty)).toBeNull();
  });
});

describe("pro-packs-discovery: 注册与注销", () => {
  it("scans a v2 teamsRoot team.json tree with its command content", () => {
    const root = temp();
    const { entryFile, packsDir } = makeProPackage(root, { teamsRoot: "teams" });
    const teamDir = join(packsDir, "test.pro.v2");
    mkdirSync(join(teamDir, "commands"), { recursive: true });
    writeFileSync(
      join(teamDir, "team.json"),
      JSON.stringify({
        id: "test.pro.v2",
        name: "V2 Pro",
        description: "v2",
        version: "0.1.0",
        formatVersion: 2,
        tier: "pro",
        publisher: "prismnext.pro",
      }),
    );
    writeFileSync(join(teamDir, "commands", "review.md"), "---\ndescription: Review\n---\nReview\n");

    process.env.PRISM_PRO_PATH = entryFile;
    expect(discoverAndRegisterProTeams().registered).toEqual(["test.pro.v2"]);
    const team = getTeamRecord("test.pro.v2");
    expect(team?.assets.some((asset) => asset.kind === "command" && asset.id === "review")).toBe(true);
  });

  it("扫描 teamsRoot → 注册含 team.json 的 pack；无清单的目录跳过", () => {
    const root = temp();
    const { entryFile, packsDir } = makeProPackage(root);
    makePack(packsDir, "test.pro.alpha", baseManifest("test.pro.alpha", { tier: "pro", publisher: "prismnext.pro" }));
    mkdirSync(join(packsDir, "broken")); // 无 team.json / plugin.json

    process.env.PRISM_PRO_PATH = entryFile;
    const result = discoverAndRegisterProTeams();

    expect(result.registered).toEqual(["test.pro.alpha"]);
    expect(result.skipped).toEqual(["broken"]);
    const pack = getTeamRecord("test.pro.alpha");
    expect(pack).not.toBeNull();
    expect(pack!.source).toBe("pro");
    expect(pack!.manifest.tier).toBe("pro");
  });

  it("pro 包路径变化/消失 → 上一轮注册的 roots 被注销（幂等差量）", () => {
    const root = temp();
    const a = makeProPackage(join(root, "a"));
    makePack(a.packsDir, "test.pro.a", baseManifest("test.pro.a", { tier: "pro", publisher: "prismnext.pro" }));
    const b = makeProPackage(join(root, "b"));
    makePack(b.packsDir, "test.pro.b", baseManifest("test.pro.b", { tier: "pro", publisher: "prismnext.pro" }));

    process.env.PRISM_PRO_PATH = a.entryFile;
    discoverAndRegisterProTeams();
    expect(getTeamRecord("test.pro.a")).not.toBeNull();

    process.env.PRISM_PRO_PATH = b.entryFile;
    discoverAndRegisterProTeams();
    expect(getTeamRecord("test.pro.a")).toBeNull(); // 旧 root 注销
    expect(getTeamRecord("test.pro.b")).not.toBeNull();

    delete process.env.PRISM_PRO_PATH; // pro 消失
    discoverAndRegisterProTeams();
    expect(getTeamRecord("test.pro.b")).toBeNull();
  });

  it("重复调用幂等：无差量时注册集合不变", () => {
    const root = temp();
    const { entryFile, packsDir } = makeProPackage(root);
    makePack(packsDir, "test.pro.alpha", baseManifest("test.pro.alpha", { tier: "pro", publisher: "prismnext.pro" }));
    process.env.PRISM_PRO_PATH = entryFile;
    discoverAndRegisterProTeams();
    const second = discoverAndRegisterProTeams();
    expect(second.registered).toEqual(["test.pro.alpha"]);
    expect(getTeamRecord("test.pro.alpha")).not.toBeNull();
  });
});

describe("pro-packs-discovery: license 变化串联", () => {
  it("handleProLicenseChanged → licenseStateVersion +1（resolver 视图缓存键翻转）", () => {
    delete process.env.PRISM_PRO_PATH;
    const before = licenseStateVersion();
    handleProLicenseChanged();
    expect(licenseStateVersion()).toBe(before + 1);
  });
});
