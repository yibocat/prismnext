/**
 * Load clickable remotes from the user's OpenSSH config.
 * Include is expanded; wildcards are not listed.
 */

import { existsSync, globSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { parseSshConfig, type SshConfigHost } from "../../shared/remote";

const MAX_INCLUDE_DEPTH = 8;

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function resolveInclude(baseDir: string, spec: string): string[] {
  const expanded = expandHome(spec);
  const abs = isAbsolute(expanded) ? expanded : join(baseDir, expanded);
  if (abs.includes("*") || abs.includes("?")) {
    try {
      return globSync(abs);
    } catch {
      return [];
    }
  }
  return existsSync(abs) ? [abs] : [];
}

function readConfigFile(filePath: string, depth: number, seen: Set<string>): SshConfigHost[] {
  if (depth > MAX_INCLUDE_DEPTH) return [];
  const resolved = expandHome(filePath);
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  if (!existsSync(resolved)) return [];
  let text = "";
  try {
    text = readFileSync(resolved, "utf8");
  } catch {
    return [];
  }
  const parsed = parseSshConfig(text);
  const hosts = [...parsed.hosts];
  const dir = dirname(resolved);
  for (const spec of parsed.includes) {
    for (const included of resolveInclude(dir, spec)) {
      hosts.push(...readConfigFile(included, depth + 1, seen));
    }
  }
  return hosts;
}

export function defaultSshConfigPath(): string {
  return join(homedir(), ".ssh", "config");
}

export function loadUserSshConfigHosts(configPath = defaultSshConfigPath()): SshConfigHost[] {
  const byAlias = new Map<string, SshConfigHost>();
  for (const host of readConfigFile(configPath, 0, new Set())) {
    if (!byAlias.has(host.alias)) byAlias.set(host.alias, host);
  }
  return [...byAlias.values()].sort((a, b) => a.alias.localeCompare(b.alias));
}

export function findSshConfigHost(alias: string, configPath = defaultSshConfigPath()): SshConfigHost | null {
  return loadUserSshConfigHosts(configPath).find((item) => item.alias === alias) ?? null;
}
