/**
 * OpenSSH config Host list (text in, hosts out).
 * Wildcard Host / Match blocks are defaults or skipped — they are not clickable remotes.
 */

export interface SshConfigHost {
  /** `Host` alias passed to `ssh <alias>`. */
  alias: string;
  /** Resolved HostName, or the alias when HostName is omitted. */
  hostname: string;
  port: number;
  user?: string;
  identityFile?: string;
  proxyJump?: string;
}

export interface ParsedSshConfig {
  hosts: SshConfigHost[];
  includes: string[];
}

interface HostBlock {
  patterns: string[];
  values: Record<string, string>;
}

function stripComment(line: string): string {
  const hash = line.indexOf("#");
  return (hash >= 0 ? line.slice(0, hash) : line).trim();
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function splitTokens(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

function isWildcardPattern(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function keywordOf(token: string): string {
  return token.toLowerCase();
}

/** Parse a config file body. `Include` paths are returned unresolved. */
export function parseSshConfig(text: string): ParsedSshConfig {
  const includes: string[] = [];
  const blocks: HostBlock[] = [];
  let current: HostBlock | null = null;
  let skippingMatch = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line) continue;
    const tokens = splitTokens(line);
    if (tokens.length === 0) continue;
    const key = keywordOf(tokens[0] ?? "");
    const rest = tokens.slice(1);

    if (key === "include") {
      for (const item of rest) includes.push(unquote(item));
      continue;
    }
    if (key === "match") {
      skippingMatch = true;
      current = null;
      continue;
    }
    if (key === "host") {
      skippingMatch = false;
      current = { patterns: rest.map(unquote).filter(Boolean), values: {} };
      blocks.push(current);
      continue;
    }
    if (skippingMatch || !current || rest.length === 0) continue;
    current.values[key] = unquote(rest.join(" "));
  }

  const defaults: Record<string, string> = {};
  for (const block of blocks) {
    if (block.patterns.length === 1 && block.patterns[0] === "*") {
      Object.assign(defaults, block.values);
    }
  }

  const byAlias = new Map<string, SshConfigHost>();
  for (const block of blocks) {
    for (const alias of block.patterns) {
      if (!alias || isWildcardPattern(alias)) continue;
      const values = { ...defaults, ...block.values };
      const hostname = values.hostname || alias;
      const portRaw = Number(values.port);
      const port = Number.isInteger(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : 22;
      const host: SshConfigHost = { alias, hostname, port };
      if (values.user) host.user = values.user;
      if (values.identityfile) host.identityFile = values.identityfile;
      if (values.proxyjump) host.proxyJump = values.proxyjump;
      byAlias.set(alias, host);
    }
  }

  return { hosts: [...byAlias.values()], includes };
}

export function sshConfigHostToProfile(host: SshConfigHost): import("./profile").SshProfile {
  return {
    id: host.alias,
    name: host.alias,
    host: host.hostname,
    port: host.port,
    user: host.user ?? "",
    identityFile: host.identityFile,
    strictHostKey: true,
  };
}
