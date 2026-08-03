/**
 * project-rule-write — Create or update `.prismnext/agent/rules/<name>/RULE.md`.
 *
 * Keep validation helpers in sync with `src/shared/project-rule-md.ts`.
 */
import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

type ProjectRuleWriteMode = "create" | "replace" | "append";

interface ProjectRuleMarkdownFields {
  name: string;
  description: string;
  apply: string;
  enabled: boolean;
  body: string;
}

function isValidRuleName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name.trim());
}

function parseFrontmatterField(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function parseProjectRuleMarkdown(content: string): ProjectRuleMarkdownFields {
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

function buildProjectRuleMarkdown(fields: ProjectRuleMarkdownFields): string {
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

function resolveProjectRuleWrite(input: {
  existingContent: string | null;
  name: string;
  description: string;
  body: string;
  mode: ProjectRuleWriteMode;
  apply: string;
}):
  | { ok: true; content: string; mode: ProjectRuleWriteMode }
  | { ok: false; error: string } {
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
  if (!description) return { ok: false, error: "description is required." };
  if (!body) return { ok: false, error: "body is required." };
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

function toolOutput(data: Record<string, unknown>): { output: string } {
  return { output: JSON.stringify(data, null, 2) };
}

export default tool({
  description:
    "Create or update a PrismNext project rule at `.prismnext/agent/rules/<name>/RULE.md`. " +
    "Use when the user asks to remember a stable preference, or after they confirm a remember suggestion. " +
    "Do not use generic edit/write on project rules — use this tool only. apply=always only.",
  args: {
    name: tool.schema.string().describe("kebab-case rule id / frontmatter name"),
    description: tool.schema.string().describe("One-line when this rule applies"),
    body: tool.schema.string().describe("Markdown body without frontmatter"),
    mode: tool.schema
      .string()
      .describe("create | replace | append — omit to auto: append if exists else create")
      .optional(),
    apply: tool.schema.string().describe("Must be always").optional(),
  },
  async execute(args, context) {
    const directory = (context as { directory?: string }).directory || process.cwd();
    const name = typeof args.name === "string" ? args.name.trim() : "";
    const description = typeof args.description === "string" ? args.description.trim() : "";
    const body = typeof args.body === "string" ? args.body : "";
    const apply = typeof args.apply === "string" ? args.apply.trim() || "always" : "always";

    if (!name) return toolOutput({ ok: false, error: "Missing name parameter." });

    const ruleDir = path.join(directory, ".prismnext", "agent", "rules", name);
    const rulePath = path.join(ruleDir, "RULE.md");
    const exists = fs.existsSync(rulePath);
    const existingContent = exists ? fs.readFileSync(rulePath, "utf-8") : null;

    let modeRaw = typeof args.mode === "string" ? args.mode.trim() : "";
    if (!modeRaw) modeRaw = exists ? "append" : "create";
    const mode = modeRaw as ProjectRuleWriteMode;
    if (mode !== "create" && mode !== "replace" && mode !== "append") {
      return toolOutput({ ok: false, error: `Invalid mode "${modeRaw}".` });
    }

    const resolved = resolveProjectRuleWrite({
      existingContent,
      name,
      description,
      body,
      mode,
      apply,
    });

    if (!resolved.ok) {
      return toolOutput({ ok: false, error: resolved.error });
    }

    fs.mkdirSync(ruleDir, { recursive: true });
    fs.writeFileSync(rulePath, resolved.content, "utf-8");

    return toolOutput({
      ok: true,
      name,
      mode: resolved.mode,
      path: `.prismnext/agent/rules/${name}/RULE.md`,
    });
  },
});
