import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listCorePackSkills } from "../../src/main/services/core-pack-skills";
import {
  installAllFromLibrarySource,
  installLibraryCatalogItem,
  uninstallAllFromLibrarySource,
} from "../../src/main/services/skill-library-catalog";
import {
  listProjectSkills,
  PRISM_CURATED_SOURCE_ID,
  PRISM_LOCAL_SKILLS_REL,
  setSkillContentEnabled,
} from "../../src/main/services/skills-sync";
import { readPacksState } from "../../src/main/services/packs-state";
import { CORE_PACK_ID } from "../../src/shared/packs/types";

/**
 * 引用模型（§5.6.2）：core pack 技能天然可用，「安装」= 启用、
 * 「卸载」= 禁用，全程零拷贝。这里不 import packs-test-utils ——
 * 需要命中真实 core pack（resources/plugins/prismnext.core）。
 */
describe("skill-library-catalog bundled (reference model)", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function makeRoot(): string {
    root = mkdtempSync(join(tmpdir(), "prism-skill-batch-"));
    return root;
  }

  it("installAllFromLibrarySource enables every core skill with zero copies", async () => {
    const r = makeRoot();
    const core = listCorePackSkills();
    expect(core.length).toBeGreaterThan(0);

    const { installedIds } = await installAllFromLibrarySource(r, PRISM_CURATED_SOURCE_ID);
    expect(installedIds.sort()).toEqual(core.map((s) => s.id).sort());

    // 全部 core 技能在 resolver 视图里可见且启用
    const installed = listProjectSkills(r);
    const coreRows = installed.filter((s) => s.origin === "bundled");
    expect(coreRows.map((s) => s.id).sort()).toEqual(core.map((s) => s.id).sort());
    for (const row of coreRows) {
      expect(row.enabled).toBe(true);
      expect(row.removable).toBe(false);
    }

    // 零拷贝：项目里不存在任何 local 技能副本
    expect(existsSync(join(r, PRISM_LOCAL_SKILLS_REL))).toBe(false);
    // 零状态污染：未禁用任何东西时 disabledContent 为空
    expect(readPacksState(r).disabledContent).toEqual([]);
  });

  it("uninstallAllFromLibrarySource disables core skills but keeps local custom ones", async () => {
    const r = makeRoot();
    const core = listCorePackSkills();

    // local custom 技能不应被动到
    const customDir = join(r, PRISM_LOCAL_SKILLS_REL, "my-custom-skill");
    mkdirSync(customDir, { recursive: true });
    writeFileSync(
      join(customDir, "SKILL.md"),
      "---\nname: my-custom-skill\ndescription: test\n---\n\nbody\n",
      "utf-8",
    );

    const { removedIds } = await uninstallAllFromLibrarySource(r, PRISM_CURATED_SOURCE_ID);
    expect(removedIds.sort()).toEqual(core.map((s) => s.id).sort());

    const installed = listProjectSkills(r);
    for (const skill of core) {
      const row = installed.find((s) => s.fqid === `${CORE_PACK_ID}:${skill.id}`);
      expect(row?.enabled).toBe(false);
    }
    const custom = installed.find((s) => s.fqid === `user.local:my-custom-skill`);
    expect(custom?.enabled).toBe(true);
    expect(custom?.origin).toBe("custom");
    expect(existsSync(join(customDir, "SKILL.md"))).toBe(true);
  });

  it("installLibraryCatalogItem (bundled) re-enables a previously disabled core skill", async () => {
    const r = makeRoot();
    const core = listCorePackSkills();
    const first = core[0]!;
    const fqid = `${CORE_PACK_ID}:${first.id}`;

    // 预禁用单个 core 技能
    expect(setSkillContentEnabled(r, fqid, false)).toBe(fqid);
    expect(
      listProjectSkills(r).find((s) => s.fqid === fqid)?.enabled,
    ).toBe(false);

    // 「安装」= 恢复启用（零拷贝）
    const { installedIds } = await installLibraryCatalogItem(r, {
      key: `bundled:${first.id}`,
      skillId: first.id,
      name: first.name,
      description: first.description,
      sourceId: PRISM_CURATED_SOURCE_ID,
      sourceLabel: "Built-in",
      sourceKind: "bundled",
    });
    expect(installedIds).toEqual([first.id]);
    expect(
      listProjectSkills(r).find((s) => s.fqid === fqid)?.enabled,
    ).toBe(true);
    expect(existsSync(join(r, PRISM_LOCAL_SKILLS_REL, first.id))).toBe(false);
  });
});
