/**
 * Pure helpers for `.workbench/agent/rules/<id>/RULE.md` — shared by tests and
 * Electron main. OpenCode tool `project-rule-write.ts` inlines the same logic.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export type ProjectRuleWriteMode = "create" | "replace" | "append";

export interface ProjectRuleMarkdownFields {
  name: string;
  description: string;
  apply: string;
  enabled: boolean;
  body: string;
}

export function isValidRuleName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim());
}

function parseFrontmatterField(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export function parseProjectRuleMarkdown(content: string): ProjectRuleMarkdownFields {
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
  return {
    name: parseFrontmatterField(block, "name"),
    description: parseFrontmatterField(block, "description"),
    apply: parseFrontmatterField(block, "apply") || "always",
    enabled,
    body: (fm[2] ?? "").trim(),
  };
}

export function buildProjectRuleMarkdown(fields: ProjectRuleMarkdownFields): string {
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

export type ResolveProjectRuleWriteInput = {
  existingContent: string | null;
  name: string;
  description: string;
  body: string;
  mode: ProjectRuleWriteMode;
  apply: string;
};

export type ResolveProjectRuleWriteResult =
  | { ok: true; content: string; mode: ProjectRuleWriteMode }
  | { ok: false; error: string };

export function resolveProjectRuleWrite(
  input: ResolveProjectRuleWriteInput,
): ResolveProjectRuleWriteResult {
  const name = input.name.trim();
  const description = input.description.trim();
  const body = input.body.trim();
  const apply = (input.apply || "always").trim() || "always";

  if (!isValidRuleName(name)) {
    return {
      ok: false,
      error: "name must be lowercase letters, numbers, and hyphens (kebab-case).",
    };
  }
  if (!description) {
    return { ok: false, error: "description is required." };
  }
  if (!body) {
    return { ok: false, error: "body is required." };
  }
  if (apply !== "always") {
    return { ok: false, error: "Only apply: always is supported in this version." };
  }

  const exists = input.existingContent != null && input.existingContent.trim().length > 0;

  if (input.mode === "create" && exists) {
    return {
      ok: false,
      error: `Rule "${name}" already exists — use mode append or replace.`,
    };
  }
  if ((input.mode === "append" || input.mode === "replace") && !exists) {
    return {
      ok: false,
      error: `Rule "${name}" does not exist — use mode create.`,
    };
  }

  if (input.mode === "create" || input.mode === "replace") {
    return {
      ok: true,
      mode: input.mode,
      content: buildProjectRuleMarkdown({
        name,
        description,
        apply: "always",
        enabled: true,
        body,
      }),
    };
  }

  const parsed = parseProjectRuleMarkdown(input.existingContent!);
  if (parsed.name && parsed.name !== name) {
    return {
      ok: false,
      error: `Existing rule name "${parsed.name}" does not match "${name}".`,
    };
  }

  const mergedBody = parsed.body.trim()
    ? `${parsed.body.trim()}\n\n${body}`
    : body;

  return {
    ok: true,
    mode: "append",
    content: buildProjectRuleMarkdown({
      name,
      description: description || parsed.description,
      apply: "always",
      enabled: parsed.enabled,
      body: mergedBody,
    }),
  };
}
