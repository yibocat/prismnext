import {
  buildRuleMd,
  DEFAULT_RULE_BODY,
  isValidRuleName,
  parseRuleMd,
} from "./rule-config";

export function defaultNewRuleMarkdown(): string {
  return buildRuleMd({
    name: "my-rule",
    description: "When this rule applies",
    apply: "always",
    enabled: true,
    body: DEFAULT_RULE_BODY,
  });
}

export function validateRuleMarkdown(
  content: string,
  expectedId?: string,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "RULE.md cannot be empty." };

  const parsed = parseRuleMd(trimmed);
  const name = parsed.name.trim();
  if (!name) return { ok: false, error: "Frontmatter must include name:." };
  if (!isValidRuleName(name)) {
    return { ok: false, error: "name must be lowercase letters, numbers, and hyphens." };
  }
  if (!parsed.description.trim()) {
    return { ok: false, error: "Frontmatter must include description:." };
  }
  if (expectedId && name !== expectedId) {
    return { ok: false, error: `name must stay "${expectedId}" (matches the rule folder).` };
  }
  return { ok: true, name };
}
