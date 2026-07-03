import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PRISM_RULES_REL = ".prismnext/agent/rules";
const RULE_FILE = "RULE.md";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ProjectRuleInfo {
  id: string;
  name: string;
  description: string;
  apply: string;
  enabled: boolean;
  ruleDirRel: string;
}

function parseFrontmatterField(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function parseRuleMd(content: string): {
  name: string;
  description: string;
  apply: string;
  enabled: boolean;
  body: string;
} {
  const fm = content.match(FRONTMATTER_RE);
  if (!fm) {
    return {
      name: "",
      description: "",
      apply: "always",
      enabled: true,
      body: content.trim(),
    };
  }
  const block = fm[1];
  const enabledRaw = parseFrontmatterField(block, "enabled").toLowerCase();
  const enabled = enabledRaw !== "false" && enabledRaw !== "0" && enabledRaw !== "no";
  const apply = parseFrontmatterField(block, "apply") || "always";
  return {
    name: parseFrontmatterField(block, "name"),
    description: parseFrontmatterField(block, "description"),
    apply,
    enabled,
    body: (fm[2] ?? "").trim(),
  };
}

function buildRuleMd(fields: {
  name: string;
  description: string;
  apply: string;
  enabled: boolean;
  body: string;
}): string {
  return [
    "---",
    `name: ${fields.name}`,
    `description: ${fields.description}`,
    `apply: ${fields.apply}`,
    `enabled: ${fields.enabled}`,
    "---",
    "",
    fields.body.trim(),
    "",
  ].join("\n");
}

function readRuleFile(ruleMdPath: string): ReturnType<typeof parseRuleMd> | null {
  try {
    return parseRuleMd(readFileSync(ruleMdPath, "utf-8"));
  } catch {
    return null;
  }
}

export function listProjectRules(projectRoot: string): ProjectRuleInfo[] {
  const rulesRoot = join(projectRoot, PRISM_RULES_REL);
  if (!existsSync(rulesRoot)) return [];

  const results: ProjectRuleInfo[] = [];

  for (const entry of readdirSync(rulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const ruleMdPath = join(rulesRoot, entry.name, RULE_FILE);
    if (!existsSync(ruleMdPath)) continue;

    const meta = readRuleFile(ruleMdPath);
    if (!meta) continue;

    const id = entry.name;
    results.push({
      id,
      name: meta.name || id,
      description: meta.description || "",
      apply: meta.apply || "always",
      enabled: meta.enabled,
      ruleDirRel: `${PRISM_RULES_REL}/${id}`,
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export interface GetPromptProjectRulesOptions {
  /** Rule frontmatter `name` or directory id. When set and non-empty, only matching rules inject. */
  allowlist?: string[];
}

function ruleMatchesAllowlist(
  ruleName: string,
  ruleId: string,
  allowlist: Set<string>,
): boolean {
  return allowlist.has(ruleName) || allowlist.has(ruleId);
}

/** Rules injected into the chat turn (apply: always, enabled). */
export function getPromptProjectRules(
  projectRoot: string,
  options?: GetPromptProjectRulesOptions,
): Array<{ name: string; content: string }> {
  const rulesRoot = join(projectRoot, PRISM_RULES_REL);
  if (!existsSync(rulesRoot)) return [];

  const allowlist = options?.allowlist?.filter(Boolean);
  const allowed = allowlist?.length ? new Set(allowlist) : null;

  const results: Array<{ name: string; content: string }> = [];

  for (const entry of readdirSync(rulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const ruleMdPath = join(rulesRoot, entry.name, RULE_FILE);
    if (!existsSync(ruleMdPath)) continue;

    const meta = readRuleFile(ruleMdPath);
    if (!meta || !meta.enabled) continue;
    if (meta.apply !== "always") continue;

    const name = meta.name.trim() || entry.name;
    const content = meta.body.trim();
    if (!content) continue;
    if (allowed && !ruleMatchesAllowlist(name, entry.name, allowed)) continue;

    results.push({ name, content });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function installProjectRule(
  projectRoot: string,
  ruleId: string,
  content: string,
): void {
  const ruleDir = join(projectRoot, PRISM_RULES_REL, ruleId);
  mkdirSync(ruleDir, { recursive: true });
  writeFileSync(join(ruleDir, RULE_FILE), content, "utf-8");
}

export function deleteProjectRule(projectRoot: string, ruleId: string): void {
  const ruleDir = join(projectRoot, PRISM_RULES_REL, ruleId);
  if (existsSync(ruleDir)) {
    rmSync(ruleDir, { recursive: true, force: true });
  }
}

export function setProjectRuleEnabled(
  projectRoot: string,
  ruleId: string,
  enabled: boolean,
): void {
  const ruleMdPath = join(projectRoot, PRISM_RULES_REL, ruleId, RULE_FILE);
  if (!existsSync(ruleMdPath)) return;

  const meta = readRuleFile(ruleMdPath);
  if (!meta) return;

  const next = buildRuleMd({
    name: meta.name || ruleId,
    description: meta.description,
    apply: meta.apply || "always",
    enabled,
    body: meta.body,
  });
  writeFileSync(ruleMdPath, next, "utf-8");
}
