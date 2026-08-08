#!/usr/bin/env node
/**
 * prepare-pro-packs.mjs —— 打包前把 Pro 私有包的 pack 数据复制进 resources/（§8.1/R-4）。
 *
 * renderer 侧的 pro 代码在构建期经 vite 别名打进 bundle（PRISM_PRO_PATH）；
 * 但 main 进程的 pack discovery 是纯文件扫描，pro 包的 `packs/` 必须以文件形式
 * 随 app 发货。electron-builder 的 extraResources 已整体 shipped `resources/`，
 * 所以本脚本把 pro 包的 `package.json` + `packs/` 复制到 `resources/pro-package/`——
 * prod 布局与 dev 约定一致（见 src/main/services/pro-packs-discovery.ts）。
 *
 * 来源解析（与 discovery 同源）：
 *   PRISM_PRO_PATH（可指向 pro 仓 src/index.ts 或包根；dev:pro / dist:pro 脚本注入）
 * 无 pro 包（OSS 构建）时清空目标目录后正常退出——resources/pro-package/ 不存在
 * 即「无 pro packs」，discovery 返回 null，是合法状态。
 *
 * resources/pro-package/ 是构建产物，已加入 .gitignore，绝不入库。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, copyFileSync, cpSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(repoRoot, "resources", "pro-package");

function findProPackageDirUp(startPath, maxLevels = 4) {
  let dir;
  try {
    dir = statSync(startPath).isDirectory() ? startPath : dirname(startPath);
  } catch {
    return null;
  }
  for (let i = 0; i <= maxLevels; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.prismnext?.packsRoot || existsSync(join(dir, "packs"))) return dir;
      } catch {
        // 继续向上
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function cleanTarget() {
  rmSync(target, { recursive: true, force: true });
}

const raw = process.env.PRISM_PRO_PATH?.trim();
if (!raw) {
  cleanTarget();
  console.log("[prepare-pro-packs] PRISM_PRO_PATH 未设置 → OSS 构建，无 pro packs");
  process.exit(0);
}

const packageDir = findProPackageDirUp(resolve(raw));
if (!packageDir) {
  console.error(`[prepare-pro-packs] 找不到 pro 包目录（PRISM_PRO_PATH=${raw}）`);
  process.exit(1);
}

let packsRoot = "packs";
try {
  const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));
  if (typeof pkg.prismnext?.packsRoot === "string" && pkg.prismnext.packsRoot.trim()) {
    packsRoot = pkg.prismnext.packsRoot.trim();
  }
} catch (err) {
  console.error(`[prepare-pro-packs] package.json 解析失败: ${packageDir}`, err);
  process.exit(1);
}

const packsDir = join(packageDir, packsRoot);
if (!existsSync(packsDir)) {
  // 包存在但没有 packs 目录 = 合法的「无 packs 的 pro 包」
  cleanTarget();
  console.log(`[prepare-pro-packs] pro 包无 ${packsRoot}/ 目录 → 无 pro packs`);
  process.exit(0);
}

cleanTarget();
mkdirSync(target, { recursive: true });
copyFileSync(join(packageDir, "package.json"), join(target, "package.json"));
cpSync(packsDir, join(target, packsRoot), { recursive: true });

const packs = readdirSync(join(target, packsRoot), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
console.log(`[prepare-pro-packs] 已复制 ${packs.length} 个 pro pack → resources/pro-package/:`, packs.join(", ") || "(无)");
