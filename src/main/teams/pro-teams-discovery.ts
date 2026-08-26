/**
 * pro-packs-discovery.ts —— Pro 私有包的 pack 发现与注册（§8.2，治 P4）。
 *
 * 纯文件扫描：main 进程**不 import pro 代码**（pro 代码是 renderer React 模块，
 * 经 vite 别名 `@prismnext/pro` 加载）；main 只关心 pro 包目录下的 `packs/` 数据。
 *
 * 路径解析与 renderer 侧同源约定，集中在本文件的 {@link resolveProPackageDir}：
 * - dev：`PRISM_PRO_PATH`（见 package.json `dev:pro` 脚本，指向 pro 仓 `src/index.ts`
 *   或包根）→ 向上找到含 package.json 的包目录；
 * - prod：打包前 `scripts/prepare-pro-packs.mjs` 把 pro 包的 `package.json` + `packs/`
 *   复制进 `resources/pro-package/`，随 extraResources 整体发货；
 * - OSS 构建（无 pro 包）→ null，discovery 为无操作。
 *
 * 注册入口 = teams/catalog 的 `registerExternalTeamRoot`（唯一注册口）。
 * license 不激活时**照常注册**（catalog 可见 → upsell），门控在 resolver（§8.3）。
 */

import { isAppPackaged } from "../app/paths";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  invalidateCatalog,
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "./catalog";
import { invalidateLicenseCache, isHostLicenseSessionMode, licenseGrants } from "./teams-license";
import { resolveHostProPackageDir } from "../workbench/home";
import { installTeam } from "./lifecycle";
import { notifyTeamsChanged } from "./resolver";
import { _registeredRoots } from "../project/active-project-roots";
import { createLogger } from "../app/logger";

const log = createLogger("pro-packs-discovery");

/** prod 打包布局：pro 包（package.json + packs/）在 resources 下的落点 */
export function getPackagedProPackageDir(resourcesPath?: string): string {
  const base = resourcesPath ?? process.resourcesPath ?? "";
  return join(base, "resources", "pro-package");
}

/**
 * 从 `PRISM_PRO_PATH` 推导 pro 包目录。env 可指向：
 * - 包内某个文件（dev:pro 脚本指向 `src/index.ts`）→ 从所在目录向上找；
 * - 包根目录本身。
 * 「找到」的判定：该目录存在 package.json 且声明 `prismnext.packsRoot`
 * 或存在 packs/ 子目录。最多向上 4 层，防止一路走到磁盘根。
 */
export function findProPackageDirUp(startPath: string, maxLevels = 4): string | null {
  let dir: string;
  try {
    dir = statSync(startPath).isDirectory() ? startPath : dirname(startPath);
  } catch {
    return null;
  }
  for (let i = 0; i <= maxLevels; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
          prismnext?: { packsRoot?: string; teamsRoot?: string };
        };
        if (pkg.prismnext?.packsRoot || pkg.prismnext?.teamsRoot || existsSync(join(dir, "packs")) || existsSync(join(dir, "teams"))) return dir;
      } catch {
        // package.json 解析失败 → 继续向上
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * pro 包目录的唯一解析口（§8.2「路径解析单一函数双端共用」的 main 端）：
 * 1. `PRISM_PRO_PATH`（dev / 官方构建时由脚本注入）；
 * 2. packaged 布局 `<resources>/resources/pro-package`；
 * 3. 否则 null（OSS 构建无 pro 包）。
 */
export function resolveProPackageDir(env: string | undefined = process.env.PRISM_PRO_PATH): string | null {
  const raw = env?.trim();
  if (raw) {
    const dir = findProPackageDirUp(resolve(raw));
    if (dir) return dir;
    log.warn("PRISM_PRO_PATH is set but the pro package directory was not found");
  }
  if (isHostLicenseSessionMode()) {
    const hostDir = resolveHostProPackageDir();
    if (existsSync(join(hostDir, "package.json"))) return hostDir;
  }
  try {
    if (isAppPackaged()) {
      const packaged = getPackagedProPackageDir();
      if (existsSync(join(packaged, "package.json"))) return packaged;
    }
  } catch {
    // Electron 之外（vitest / 脚本）按无 packaged 布局处理
  }
  return null;
}

/** 读 pro 包 package.json → teamsRoot 绝对路径（默认 "packs"；兼容读旧键 packsRoot）；
 *  新键 teamsRoot 优先；目录不存在 → null */
export function resolveTeamsRootDir(packageDir: string): string | null {
  let teamsRoot = "packs";
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8")) as {
      prismnext?: { packsRoot?: string; teamsRoot?: string };
    };
    // New key wins; fall back to legacy key.
    const root = pkg.prismnext?.teamsRoot ?? pkg.prismnext?.packsRoot;
    if (typeof root === "string" && root.trim()) {
      teamsRoot = root.trim();
    }
  } catch (err) {
    log.warn("pro package.json parse failed", {
      package: basename(packageDir),
      error: String(err),
    });
    return null;
  }
  // 防逃逸：teamsRoot 必须仍在包目录内
  const dir = resolve(packageDir, teamsRoot);
  if (!dir.startsWith(resolve(packageDir) + "/")) return null;
  return existsSync(dir) ? dir : null;
}

function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** 上一轮 discovery 注册的 pack 根（用于 PRISM_PRO_PATH 变化 / pro 消失时注销） */
let lastRegisteredRoots = new Set<string>();

/**
 * 扫描 pro 包 teamsRoot → 把 teamsRoot 自身注册为 external pack root。
 * teams/catalog 把 external root 视为「Team 的父目录」并扫描其下的 Team 子目录。
 * 幂等：重复调用只增删差量；pro 包消失时注销上一轮全部注册。
 * 调用时机：app 启动（registerIpcHandlers 之前）、license 激活/清除后、
 * PRISM_PRO_PATH 变化（dev 重启进程即覆盖）。
 */
export function discoverAndRegisterProTeams(): { registered: string[]; skipped: string[] } {
  const registered: string[] = [];
  const skipped: string[] = [];
  const found = new Set<string>();

  const packageDir = resolveProPackageDir();
  if (packageDir) {
    const teamsRoot = resolveTeamsRootDir(packageDir);
    if (teamsRoot) {
      registerExternalTeamRoot(teamsRoot);
      found.add(normalizeDir(teamsRoot));
      for (const entry of readdirSync(teamsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (existsSync(join(teamsRoot, entry.name, "team.json")) || existsSync(join(teamsRoot, entry.name, "plugin.json"))) {
          registered.push(entry.name);
        } else {
          skipped.push(entry.name);
          log.warn("skipped folder without team.json/plugin.json", { name: entry.name });
        }
      }
    }
  }

  for (const prev of lastRegisteredRoots) {
    if (!found.has(prev)) unregisterExternalTeamRoot(prev);
  }
  lastRegisteredRoots = found;

  if ((registered.length || skipped.length) && packageDir) {
    log.info("pro packs discovery complete", {
      package: basename(packageDir),
      registered,
      skipped,
    });
  }
  return { registered, skipped };
}

/**
 * Host: packs on disk are not usable until they have an install record.
 * Laptop already installed them; the server `teams-state.json` starts empty.
 * Call after grant + discover. No-op without a live grant.
 */
export function installDiscoveredProTeams(teamIds: string[]): string[] {
  if (!licenseGrants() || teamIds.length === 0) return [];
  const installed: string[] = [];
  for (const teamId of teamIds) {
    try {
      installTeam(teamId);
      installed.push(teamId);
    } catch (err) {
      log.warn("discovered pro team could not be installed", { teamId, error: String(err) });
    }
  }
  return installed;
}

/**
 * license 变化后的统一串联（§8.3 可见性矩阵第 4/5 行）：
 * 1. 授权缓存失效（licenseStateVersion +1 → resolver 视图缓存键变化）；
 * 2. 重跑 discovery（pro 包可能随构建/路径变化出现或消失；照常注册，门控在 resolver）；
 * 3. catalog 失效（locked 标记随授权翻转）；
 * 4. 全部已打开项目的 resolver 视图失效 + experts/skills 再同步
 *    （license 失效 → pro 内容即时从 OpenCode 配置撤出；恢复 → 自动复活）。
 */
export function handleProLicenseChanged(): void {
  invalidateLicenseCache();
  discoverAndRegisterProTeams();
  invalidateCatalog();
  const roots = _registeredRoots();
  if (roots.length === 0) {
    notifyTeamsChanged();
    return;
  }
  for (const root of roots) notifyTeamsChanged(root);
}
