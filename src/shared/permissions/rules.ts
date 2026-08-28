/**
 * Verdent-style user permission rules — parser, matcher, settings merge.
 * Isomorphic (main + renderer); no node:path.
 */
import { bashCommandMatchesAnyPattern, bashCommandMatchesPattern } from "./bash-allow-always";
import {
  isPathNestedInside,
  normalizeAbsPath,
  normalizeFsSeparators,
  resolveFsPath,
  isAbsoluteFsPath,
} from "../platform/fs-path";

export type PermissionRuleContext = {
  toolName: string;
  projectRoot?: string | null;
  filePath?: string | null;
  sourcePath?: string | null;
  destinationPath?: string | null;
  bashCommand?: string | null;
  bashCwd?: string | null;
};

export type ParsedPermissionRule = {
  toolName: string;
  pattern: string | null;
  raw: string;
  line: number;
};

export type PermissionRulesConfig = {
  allowedPaths: string[];
  allowRules: ParsedPermissionRule[];
  denyRules: ParsedPermissionRule[];
  bashAllowAlwaysPatterns: string[];
  toolAllowAlways: string[];
};

export type PermissionRuleParseResult = {
  rules: ParsedPermissionRule[];
  errors: Array<{ line: number; message: string; raw: string }>;
};

export type PermissionRuleMatchSource =
  | "user_deny"
  | "user_allow"
  | "bash_allow_always"
  | "tool_allow_always"
  | "allowed_path"
  | null;

const TOOL_ALIASES: Record<string, string> = {
  bash: "bash",
  shell: "bash",
  terminal: "bash",
  execute: "bash",
  webfetch: "webfetch",
  websearch: "websearch",
  read: "read",
  write: "write",
  edit: "edit",
  delete: "delete",
  move: "move",
  apply_patch: "apply_patch",
  applypatch: "apply_patch",
  "experiment-run": "experiment-run",
  experimentrun: "experiment-run",
};

export function normalizePermissionToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (TOOL_ALIASES[lower]) return TOOL_ALIASES[lower];
  return lower.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Parse one line: `ToolName(pattern)` or `ToolName` or `# comment`. */
export function parsePermissionRuleLine(
  line: string,
  lineNumber: number,
): ParsedPermissionRule | { error: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*(?:\(([^)]*)\))?\s*$/.exec(trimmed);
  if (!match) {
    return { error: `Invalid rule syntax: ${trimmed}` };
  }
  const toolName = normalizePermissionToolName(match[1]!);
  if (!toolName) {
    return { error: `Unknown tool: ${match[1]}` };
  }
  let pattern: string | null = match[2]?.trim() ?? null;
  if (pattern === "*" || pattern === "") {
    pattern = null;
  }
  return { toolName, pattern, raw: trimmed, line: lineNumber };
}

export function parsePermissionRuleLines(text: string): PermissionRuleParseResult {
  const rules: ParsedPermissionRule[] = [];
  const errors: PermissionRuleParseResult["errors"] = [];
  const lines = (text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const parsed = parsePermissionRuleLine(lines[i]!, i + 1);
    if (!parsed) continue;
    if ("error" in parsed) {
      errors.push({ line: i + 1, message: parsed.error, raw: lines[i]!.trim() });
      continue;
    }
    rules.push(parsed);
  }
  return { rules, errors };
}

export function parseAllowedPathsLines(text: string): {
  paths: string[];
  errors: Array<{ line: number; message: string; raw: string }>;
} {
  const paths: string[] = [];
  const errors: Array<{ line: number; message: string; raw: string }> = [];
  const lines = (text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith("/") && !/^[A-Za-z]:[/\\]/.test(trimmed)) {
      errors.push({
        line: i + 1,
        message: "Path must be absolute",
        raw: trimmed,
      });
      continue;
    }
    paths.push(normalizeAbsPath(trimmed));
  }
  return { paths, errors };
}

const MAX_PATTERN_CACHE = 1000;
const pathPatternRegexCache = new Map<string, RegExp>();

function pathPatternToRegex(pattern: string): RegExp {
  const normalized = normalizeFsSeparators(pattern);
  const cached = pathPatternRegexCache.get(normalized);
  if (cached) return cached;
  let reSource = "^";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    if (ch === "*" && normalized[i + 1] === "*") {
      reSource += ".*";
      i++;
      continue;
    }
    if (ch === "*") {
      reSource += "[^/]*";
      continue;
    }
    if (/[+^${}()|[\]\\.]/.test(ch)) reSource += `\\${ch}`;
    else reSource += ch;
  }
  reSource += "$";
  const regex = new RegExp(reSource);
  if (pathPatternRegexCache.size >= MAX_PATTERN_CACHE) pathPatternRegexCache.clear();
  pathPatternRegexCache.set(normalized, regex);
  return regex;
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalized = normalizeFsSeparators(path);
  const pat = normalizeFsSeparators(pattern);
  if (!pat.includes("*")) {
    return normalized === pat || isPathNestedInside(pat, normalized);
  }
  try {
    return pathPatternToRegex(pat).test(normalized);
  } catch {
    return false;
  }
}

function isShellToolName(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return (
    n === "bash"
    || n === "experiment-run"
    || n === "latex-compile"
    || n === "latex-compile-standalone"
    || n === "typst-compile"
    || n === "typst-compile-standalone"
    || n.includes("bash")
    || n === "shell"
    || n === "terminal"
    || n === "execute"
  );
}

function resolvePathInProject(filePath: string, projectRoot: string): string {
  const p = filePath.trim();
  if (!p) return resolveFsPath(projectRoot);
  if (isAbsoluteFsPath(p)) return resolveFsPath(p);
  return resolveFsPath(projectRoot, p);
}

function ruleTargetValues(ctx: PermissionRuleContext): string[] {
  const values: string[] = [];
  if (ctx.bashCommand?.trim()) values.push(ctx.bashCommand.trim());
  if (ctx.filePath?.trim()) values.push(ctx.filePath.trim());
  if (ctx.sourcePath?.trim()) values.push(ctx.sourcePath.trim());
  if (ctx.destinationPath?.trim()) values.push(ctx.destinationPath.trim());
  return values;
}

export function permissionRuleMatches(
  rule: ParsedPermissionRule,
  ctx: PermissionRuleContext,
): boolean {
  const tool = (ctx.toolName || "").toLowerCase();
  const ruleTool = rule.toolName;
  if (tool !== ruleTool) {
    if (ruleTool === "bash" && isShellToolName(tool)) {
      // ok
    } else {
      return false;
    }
  }

  if (!rule.pattern) return true;

  if (isShellToolName(tool) || ruleTool === "bash") {
    const cmd = ctx.bashCommand || "";
    return bashCommandMatchesPattern(cmd, rule.pattern)
      || bashCommandMatchesPattern(cmd, rule.pattern.replace(/\*\*/g, "*"));
  }

  const root = ctx.projectRoot?.trim() || "";
  for (const raw of ruleTargetValues(ctx)) {
    const candidates = root
      ? [raw, normalizeFsSeparators(resolvePathInProject(raw, root))]
      : [raw];
    for (const candidate of candidates) {
      if (pathMatchesPattern(candidate, rule.pattern)) return true;
    }
  }
  return false;
}

export function matchDenyRules(
  rules: ParsedPermissionRule[],
  ctx: PermissionRuleContext,
): ParsedPermissionRule | null {
  for (const rule of rules) {
    if (permissionRuleMatches(rule, ctx)) return rule;
  }
  return null;
}

export function matchAllowRules(
  rules: ParsedPermissionRule[],
  ctx: PermissionRuleContext,
): ParsedPermissionRule | null {
  for (const rule of rules) {
    if (permissionRuleMatches(rule, ctx)) return rule;
  }
  return null;
}

export function isLegacyToolAllowAlways(
  toolName: string,
  toolAllowAlways: string[] | undefined | null,
): boolean {
  if (!toolAllowAlways?.length || !toolName?.trim()) return false;
  const n = toolName.trim().toLowerCase();
  return toolAllowAlways.some((t) => typeof t === "string" && t.trim().toLowerCase() === n);
}

export function isLegacyBashAllowAlways(
  command: string | null | undefined,
  patterns: string[] | undefined | null,
): boolean {
  return bashCommandMatchesAnyPattern(command ?? "", patterns);
}

export function isPathUnderAllowedPaths(
  filePath: string | null | undefined,
  projectRoot: string | null | undefined,
  allowedPaths: string[] | undefined | null,
): boolean {
  if (!filePath?.trim() || !allowedPaths?.length) return false;
  const root = projectRoot?.trim() || "";
  const abs = root
    ? normalizeAbsPath(resolvePathInProject(filePath, root))
    : normalizeAbsPath(filePath);
  return allowedPaths.some((p) => {
    const allowed = normalizeAbsPath(p);
    return isPathNestedInside(allowed, abs);
  });
}

let rulesConfigCache: { fingerprint: string; config: PermissionRulesConfig } | null = null;

/**
 * Content fingerprint over the 5 input arrays. Join-compare is microseconds;
 * re-parsing rules + compiling patterns is orders of magnitude costlier.
 * Works in both processes: renderer keeps array refs stable via zustand,
 * main's getSettings() may rebuild arrays each call — content compare still hits.
 */
function rulesConfigFingerprint(input: {
  permissionAllowedPaths?: string[] | null;
  permissionAllowRules?: string[] | null;
  permissionDenyRules?: string[] | null;
  bashAllowAlwaysPatterns?: string[] | null;
  toolAllowAlways?: string[] | null;
}): string {
  return [
    input.permissionAllowedPaths,
    input.permissionAllowRules,
    input.permissionDenyRules,
    input.bashAllowAlwaysPatterns,
    input.toolAllowAlways,
  ]
    .map((arr) => (arr ?? []).map((v) => String(v)).join(""))
    .join("");
}

export function buildPermissionRulesConfig(input: {
  permissionAllowedPaths?: string[] | null;
  permissionAllowRules?: string[] | null;
  permissionDenyRules?: string[] | null;
  bashAllowAlwaysPatterns?: string[] | null;
  toolAllowAlways?: string[] | null;
}): PermissionRulesConfig {
  const fingerprint = rulesConfigFingerprint(input);
  if (rulesConfigCache && rulesConfigCache.fingerprint === fingerprint) {
    return rulesConfigCache.config;
  }
  const config = buildPermissionRulesConfigUncached(input);
  rulesConfigCache = { fingerprint, config };
  return config;
}

function buildPermissionRulesConfigUncached(input: {
  permissionAllowedPaths?: string[] | null;
  permissionAllowRules?: string[] | null;
  permissionDenyRules?: string[] | null;
  bashAllowAlwaysPatterns?: string[] | null;
  toolAllowAlways?: string[] | null;
}): PermissionRulesConfig {
  const allowFromLines = (input.permissionAllowRules ?? [])
    .flatMap((line) => {
      const parsed = parsePermissionRuleLine(line, 0);
      return parsed && !("error" in parsed) ? [parsed] : [];
    });
  const denyFromLines = (input.permissionDenyRules ?? [])
    .flatMap((line) => {
      const parsed = parsePermissionRuleLine(line, 0);
      return parsed && !("error" in parsed) ? [parsed] : [];
    });

  return {
    allowedPaths: (input.permissionAllowedPaths ?? []).map((p) => normalizeAbsPath(String(p))),
    allowRules: allowFromLines,
    denyRules: denyFromLines,
    bashAllowAlwaysPatterns: (input.bashAllowAlwaysPatterns ?? []).map(String),
    toolAllowAlways: (input.toolAllowAlways ?? []).map((t) => String(t).trim().toLowerCase()),
  };
}

/** Merge legacy always lists into display lines for Allow Rules textarea. */
export function formatAllowRulesText(config: PermissionRulesConfig): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  const add = (line: string) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  };

  for (const rule of config.allowRules) {
    add(rule.raw);
  }
  for (const pattern of config.bashAllowAlwaysPatterns) {
    if (pattern.trim()) add(`Bash(${pattern.trim()})`);
  }
  for (const tool of config.toolAllowAlways) {
    if (tool.trim()) {
      const name = tool.trim();
      add(`${name.charAt(0).toUpperCase()}${name.slice(1)}(*)`);
    }
  }
  return lines.join("\n");
}

export function formatAllowedPathsText(paths: string[] | undefined | null): string {
  return (paths ?? []).join("\n");
}

/** Split saved Allow Rules textarea back into structured settings keys. */
export function splitAllowRulesText(text: string): {
  permissionAllowRules: string[];
  bashAllowAlwaysPatterns: string[];
  toolAllowAlways: string[];
  errors: PermissionRuleParseResult["errors"];
} {
  const { rules, errors } = parsePermissionRuleLines(text);
  const permissionAllowRules: string[] = [];
  const bashAllowAlwaysPatterns: string[] = [];
  const toolAllowAlways: string[] = [];

  for (const rule of rules) {
    if (
      (rule.toolName === "bash" || rule.toolName === "experiment-run")
      && rule.pattern
    ) {
      bashAllowAlwaysPatterns.push(rule.pattern);
      continue;
    }
    if (!rule.pattern && rule.toolName !== "bash") {
      toolAllowAlways.push(rule.toolName);
      continue;
    }
    permissionAllowRules.push(rule.raw);
  }

  return {
    permissionAllowRules,
    bashAllowAlwaysPatterns: [...new Set(bashAllowAlwaysPatterns)],
    toolAllowAlways: [...new Set(toolAllowAlways)],
    errors,
  };
}

export function emptyPermissionRulesConfig(): PermissionRulesConfig {
  return {
    allowedPaths: [],
    allowRules: [],
    denyRules: [],
    bashAllowAlwaysPatterns: [],
    toolAllowAlways: [],
  };
}
