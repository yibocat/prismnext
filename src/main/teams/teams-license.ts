/**
 * Pack 授权门（§8.3）—— tier=pro pack 在任何时刻无授权即整体不激活。
 *
 * 与旧实现（plugin-pack-install.ts assertProIfNeeded，仅 install 瞬间校验）不同：
 * 本判定在 resolver 每次求值时执行，license 失效 → 内容即时失活，恢复 → 自动复活。
 *
 * `readProLicense` 在 Electron 之外（vitest）会因 app 缺失而抛错 → 按无授权处理。
 */

import { licenseGrantsFeature } from "../../shared/pro";
import { readProLicense } from "./pro-license";

let cached: { granted: boolean; grantAll: boolean; features: string[] } | null = null;
let version = 0;

function load(): { granted: boolean; grantAll: boolean; features: string[] } {
  if (cached) return cached;
  try {
    const license = readProLicense(); // 非 null 即 active pro（服务内部已过滤）
    if (license) {
      cached = {
        granted: true,
        grantAll: !license.features || license.features.length === 0,
        features: license.features ?? [],
      };
    } else {
      cached = { granted: false, grantAll: false, features: [] };
    }
  } catch {
    cached = { granted: false, grantAll: false, features: [] };
  }
  return cached;
}

/**
 * tier=pro pack 的授权判定：`feature` 缺省 = 仅要求 plan=pro；
 * 有 feature 时走 shared/pro 的 licenseGrantsFeature 语义（features 空 = 全授）。
 */
export function licenseGrants(feature?: string): boolean {
  const { granted, grantAll, features } = load();
  if (!granted) return false;
  if (!feature) return true;
  if (grantAll) return true;
  // 复用 shared 判定（构造一个最小 LicenseSnapshot 形状）
  return licenseGrantsFeature(
    { key: "cached", plan: "pro", activatedAt: new Date(0).toISOString(), features },
    feature,
  );
}

/** resolver 缓存键的一部分；license 变化时 +1 */
export function licenseStateVersion(): number {
  return version;
}

/** license 变化后调用（pro 激活/清除 IPC —— Phase 5 接线） */
export function invalidateLicenseCache(): void {
  cached = null;
  version += 1;
}
