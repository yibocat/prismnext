/** Parse and build project RULE.md files under `.prismnext/agent/rules/`. */

import { splitMarkdownFrontmatter } from "@/lib/markdown/frontmatter";

export type RuleApplyMode = "always" | "glob" | "on-demand";

export interface RuleMeta {
  name: string;
  description: string;
  apply: RuleApplyMode;
  enabled: boolean;
  body: string;
}

export function isValidRuleName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim());
}

function parseApplyMode(value: string | undefined): RuleApplyMode {
  const v = (value ?? "always").trim().toLowerCase();
  if (v === "glob" || v === "on-demand") return v;
  return "always";
}

function parseEnabled(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

export function parseRuleMd(content: string): RuleMeta {
  const { hasFrontmatter, fields, body } = splitMarkdownFrontmatter(content);
  if (!hasFrontmatter) {
    return {
      name: "",
      description: "",
      apply: "always",
      enabled: true,
      body: content.trim(),
    };
  }
  return {
    name: fields.name ?? "",
    description: fields.description ?? "",
    apply: parseApplyMode(fields.apply),
    enabled: parseEnabled(fields.enabled),
    body: body.trim(),
  };
}

export function buildRuleMd(meta: RuleMeta): string {
  const lines = [
    "---",
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    `apply: ${meta.apply}`,
    `enabled: ${meta.enabled}`,
    "---",
    "",
    meta.body.trim(),
    "",
  ];
  return lines.join("\n");
}

export const DEFAULT_RULE_BODY = `# Rule

Describe constraints and conventions the agent should follow for this project.
`;
