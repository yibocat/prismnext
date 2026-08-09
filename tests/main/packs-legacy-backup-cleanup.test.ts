/**
 * legacy-backup 清理测试（spec §11 Phase 6）。
 *
 * 覆盖：满保留期删除、未满保留、前缀外目录不动、目录名日期解析、
 * 无 agent 目录 / 读取失败的容错。
 */
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cleanupLegacyBackups,
  LEGACY_BACKUP_RETENTION_DAYS,
} from "../../src/main/services/packs-state";

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function makeRoot(): string {
  root = mkdtempSync(join(tmpdir(), "packs-backup-cleanup-"));
  return root;
}

function agentDir(): string {
  return join(root!, ".prismnext", "agent");
}

/** 建一个 legacy-backup-<date>/ 目录（内含一个文件） */
function makeBackup(dateStr: string): string {
  const dir = join(agentDir(), `legacy-backup-${dateStr}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "old-manifest.json"), "{}", "utf-8");
  return dir;
}

/** 距今 N 天前的 YYYY-MM-DD（UTC） */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("cleanupLegacyBackups（legacy-backup 清理）", () => {
  it("超过保留期的备份目录被删除", () => {
    makeRoot();
    makeBackup(daysAgo(LEGACY_BACKUP_RETENTION_DAYS + 5));
    const removed = cleanupLegacyBackups(root!);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(/^legacy-backup-\d{4}-\d{2}-\d{2}$/);
    expect(existsSync(join(agentDir(), removed[0]))).toBe(false);
  });

  it("未满保留期的备份目录保留", () => {
    makeRoot();
    makeBackup(daysAgo(2));
    const removed = cleanupLegacyBackups(root!);
    expect(removed).toEqual([]);
    expect(existsSync(join(agentDir(), `legacy-backup-${daysAgo(2)}`))).toBe(true);
  });

  it("边界：年龄恰好等于 retentionDays 才删除（用固定 now 精确控制）", () => {
    makeRoot();
    makeBackup("2026-07-10");
    // 恰好 30 天后（UTC 同刻）→ 年龄 = 30 天，达到阈值 → 删
    const at30 = cleanupLegacyBackups(root!, 30, new Date("2026-08-09T00:00:00Z"));
    expect(at30).toEqual(["legacy-backup-2026-07-10"]);
  });

  it("边界：年龄差一天未到阈值 → 保留", () => {
    makeRoot();
    makeBackup("2026-07-10");
    // 29 天后（UTC 同刻）→ 年龄 = 29 天 < 30 → 留
    const at29 = cleanupLegacyBackups(root!, 30, new Date("2026-08-08T00:00:00Z"));
    expect(at29).toEqual([]);
    expect(existsSync(join(agentDir(), "legacy-backup-2026-07-10"))).toBe(true);
  });

  it("新旧混合：只删过期的，多个日期目录按前缀扫描", () => {
    makeRoot();
    makeBackup(daysAgo(LEGACY_BACKUP_RETENTION_DAYS + 10)); // 删
    makeBackup(daysAgo(1)); // 留
    const removed = cleanupLegacyBackups(root!);
    expect(removed).toHaveLength(1);
    expect(existsSync(join(agentDir(), `legacy-backup-${daysAgo(1)}`))).toBe(true);
  });

  it("前缀外目录与普通文件不受影响", () => {
    makeRoot();
    makeBackup(daysAgo(100));
    mkdirSync(join(agentDir(), "local"), { recursive: true });
    writeFileSync(join(agentDir(), "packs.json"), "{}", "utf-8");
    mkdirSync(join(agentDir(), "legacy-backup-notadate"), { recursive: true });
    const removed = cleanupLegacyBackups(root!);
    expect(removed).toHaveLength(1);
    expect(existsSync(join(agentDir(), "local"))).toBe(true);
    expect(existsSync(join(agentDir(), "packs.json"))).toBe(true);
    expect(existsSync(join(agentDir(), "legacy-backup-notadate"))).toBe(true);
  });

  it("无 agent 目录 → 返回空，不报错", () => {
    makeRoot();
    expect(cleanupLegacyBackups(root!)).toEqual([]);
  });

  it("自定义 retentionDays / now 注入", () => {
    makeRoot();
    makeBackup("2020-01-01");
    const removed = cleanupLegacyBackups(root!, 10, new Date("2020-01-20T00:00:00Z"));
    expect(removed).toEqual(["legacy-backup-2020-01-01"]);
  });
});
