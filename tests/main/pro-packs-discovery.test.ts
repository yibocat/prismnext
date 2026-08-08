import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  discoverAndRegisterProPacks,
  findProPackageDirUp,
  handleProLicenseChanged,
  resolvePacksRootDir,
  resolveProPackageDir,
} from "../../src/main/services/pro-packs-discovery";
import {
  getPack,
  listExternalPackRoots,
  unregisterExternalPackRoot,
} from "../../src/main/services/pack-catalog";
import { licenseStateVersion } from "../../src/main/services/packs-license";
import { baseManifest, makePack, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];
const savedEnv = process.env.PRISM_PRO_PATH;

function temp(): string {
  const dir = makeTempDir("pro-discovery-test-");
  tempDirs.push(dir);
  return dir;
}

/** 构造一个 pro 包布局：package.json + src/index.ts + packsRoot/ */
function makeProPackage(
  root: string,
  opts: { packsRoot?: string; withPrismnextField?: boolean } = {},
): { packageDir: string; entryFile: string; packsDir: string } {
  const packageDir = join(root, "pro-pkg");
  const packsRootName = opts.packsRoot ?? "packs";
  mkdirSync(join(packageDir, "src"), { recursive: true });
  const pkg: Record<string, unknown> = { name: "@prismnext/pro", private: true };
  if (opts.withPrismnextField !== false) {
    pkg.prismnext = { packsRoot: packsRootName };
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
  discoverAndRegisterProPacks();
  for (const dir of listExternalPackRoots()) unregisterExternalPackRoot(dir);
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

describe("pro-packs-discovery: packsRoot 解析", () => {
  it("默认 packsRoot = packs；自定义 packsRoot 生效", () => {
    const root = temp();
    const a = makeProPackage(join(root, "a"), { withPrismnextField: false });
    expect(resolvePacksRootDir(a.packageDir)).toBe(a.packsDir);
    const b = makeProPackage(join(root, "b"), { packsRoot: "suites" });
    expect(resolvePacksRootDir(b.packageDir)).toBe(b.packsDir);
  });

  it("packsRoot 逃逸包目录（../）→ null；目录不存在 → null", () => {
    const root = temp();
    const packageDir = join(root, "evil");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "package.json"),
      JSON.stringify({ name: "evil", prismnext: { packsRoot: "../outside" } }),
    );
    expect(resolvePacksRootDir(packageDir)).toBeNull();

    const empty = join(root, "empty-pkg");
    mkdirSync(empty, { recursive: true });
    writeFileSync(join(empty, "package.json"), JSON.stringify({ name: "x" }));
    expect(resolvePacksRootDir(empty)).toBeNull();
  });
});

describe("pro-packs-discovery: 注册与注销", () => {
  it("扫描 packsRoot → 注册含 plugin.json 的 pack；无 plugin.json 的目录跳过", () => {
    const root = temp();
    const { entryFile, packsDir } = makeProPackage(root);
    makePack(packsDir, "test.pro.alpha", baseManifest("test.pro.alpha", { tier: "pro", publisher: "prismnext.pro" }));
    mkdirSync(join(packsDir, "broken")); // 无 plugin.json

    process.env.PRISM_PRO_PATH = entryFile;
    const result = discoverAndRegisterProPacks();

    expect(result.registered).toEqual(["test.pro.alpha"]);
    expect(result.skipped).toEqual(["broken"]);
    const pack = getPack("test.pro.alpha");
    expect(pack).not.toBeNull();
    expect(pack!.kind).toBe("external");
    expect(pack!.manifest.tier).toBe("pro");
  });

  it("pro 包路径变化/消失 → 上一轮注册的 roots 被注销（幂等差量）", () => {
    const root = temp();
    const a = makeProPackage(join(root, "a"));
    makePack(a.packsDir, "test.pro.a", baseManifest("test.pro.a", { tier: "pro", publisher: "prismnext.pro" }));
    const b = makeProPackage(join(root, "b"));
    makePack(b.packsDir, "test.pro.b", baseManifest("test.pro.b", { tier: "pro", publisher: "prismnext.pro" }));

    process.env.PRISM_PRO_PATH = a.entryFile;
    discoverAndRegisterProPacks();
    expect(getPack("test.pro.a")).not.toBeNull();

    process.env.PRISM_PRO_PATH = b.entryFile;
    discoverAndRegisterProPacks();
    expect(getPack("test.pro.a")).toBeNull(); // 旧 root 注销
    expect(getPack("test.pro.b")).not.toBeNull();

    delete process.env.PRISM_PRO_PATH; // pro 消失
    discoverAndRegisterProPacks();
    expect(getPack("test.pro.b")).toBeNull();
  });

  it("重复调用幂等：无差量时注册集合不变", () => {
    const root = temp();
    const { entryFile, packsDir } = makeProPackage(root);
    makePack(packsDir, "test.pro.alpha", baseManifest("test.pro.alpha", { tier: "pro", publisher: "prismnext.pro" }));
    process.env.PRISM_PRO_PATH = entryFile;
    discoverAndRegisterProPacks();
    const second = discoverAndRegisterProPacks();
    expect(second.registered).toEqual(["test.pro.alpha"]);
    expect(getPack("test.pro.alpha")).not.toBeNull();
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
