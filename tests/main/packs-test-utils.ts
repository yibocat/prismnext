/**
 * packs 体系测试夹具：临时目录 + pack 目录构造。
 * 不是测试文件（不含 .test. 后缀），供 packs-state / pack-catalog / pack-resolver 测试共用。
 */

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 测试密封：first-party 根指到空目录，真实 resources/plugins（core pack）
// 不进入 fixture 视图；fixture pack 一律走 registerExternalPackRoot。
// pack-catalog 的 getFirstPartyPacksDir 优先读该环境变量。
process.env.PRISM_FIRST_PARTY_PACKS_DIR = mkdtempSync(
  join(tmpdir(), "packs-firstparty-empty-"),
);

export function makeTempDir(prefix = "packs-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function baseManifest(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: id,
    description: `${id} description`,
    version: "0.1.0",
    packFormatVersion: 1,
    tier: "free",
    publisher: "test",
    ...overrides,
  };
}

export interface AgentFixture {
  id: string;
  def?: Record<string, unknown>;
  instructions?: string;
}

export interface SkillFixture {
  id: string;
  skillMd?: string;
}

export interface CommandFixture {
  name: string;
  md: string;
}

export interface PackContentsFixture {
  orchestrators?: AgentFixture[];
  experts?: AgentFixture[];
  skills?: SkillFixture[];
  commands?: CommandFixture[];
  mcps?: unknown[];
}

/** 在 <root>/<packDirName> 下写一个完整 pack 目录，返回 pack 目录路径。 */
export function makePack(
  root: string,
  packDirName: string,
  manifest: Record<string, unknown>,
  contents: PackContentsFixture = {},
): string {
  const dir = join(root, packDirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf-8");

  for (const [subdir, jsonName, agents] of [
    ["orchestrators", "orchestrator.json", contents.orchestrators ?? []],
    ["experts", "expert.json", contents.experts ?? []],
  ] as const) {
    for (const agent of agents) {
      const agentDir = join(dir, subdir, agent.id);
      mkdirSync(agentDir, { recursive: true });
      const def = { id: agent.id, name: agent.id, description: `${agent.id} desc`, ...agent.def };
      writeFileSync(join(agentDir, jsonName), JSON.stringify(def, null, 2), "utf-8");
      writeFileSync(
        join(agentDir, "instructions.md"),
        agent.instructions ?? `Instructions for ${agent.id}.`,
        "utf-8",
      );
    }
  }

  for (const skill of contents.skills ?? []) {
    const skillDir = join(dir, "skills", skill.id);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      skill.skillMd ?? `---\nname: ${skill.id}\ndescription: ${skill.id} skill desc\n---\n\nBody.\n`,
      "utf-8",
    );
  }

  for (const cmd of contents.commands ?? []) {
    mkdirSync(join(dir, "commands"), { recursive: true });
    writeFileSync(join(dir, "commands", `${cmd.name}.md`), cmd.md, "utf-8");
  }

  if (contents.mcps) {
    writeFileSync(join(dir, "mcp.json"), JSON.stringify(contents.mcps, null, 2), "utf-8");
  }

  return dir;
}

/** 建一个项目根（.prismnext/agent 可选预建）。 */
export function makeProjectRoot(): string {
  const root = makeTempDir("packs-project-");
  mkdirSync(join(root, ".prismnext", "agent"), { recursive: true });
  return root;
}
