/**
 * Test / injected known_hosts helper.
 * Production trust writes the user's OpenSSH `~/.ssh/known_hosts` via ssh-keyscan.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { homeKnownHostsRel } from "../../shared/workbench/paths";
import { resolveWorkbenchHome } from "../workbench/home";

export type HostKeyDecision = "accept" | "unknown" | "mismatch";

export function hostKeyId(host: string, port: number): string {
  return `${host.trim().toLowerCase()} ${port}`;
}

export function fingerprintSha256(key: Uint8Array): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return `SHA256:${hex}`;
}

export function parseKnownHosts(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [host, portRaw, fingerprint] = parts;
    const port = Number(portRaw);
    if (!host || !fingerprint || !Number.isInteger(port)) continue;
    map.set(hostKeyId(host, port), fingerprint);
  }
  return map;
}

export function formatKnownHosts(map: Map<string, string>): string {
  const lines = ["# PrismNext SSH host keys — not ~/.ssh/known_hosts", ""];
  const keys = [...map.keys()].sort();
  for (const key of keys) {
    const fingerprint = map.get(key);
    if (!fingerprint) continue;
    const space = key.lastIndexOf(" ");
    const host = key.slice(0, space);
    const port = key.slice(space + 1);
    lines.push(`${host} ${port} ${fingerprint}`);
  }
  return `${lines.join("\n")}\n`;
}

export function decideHostKey(
  stored: string | undefined,
  presented: string,
  strict: boolean,
): HostKeyDecision {
  if (!stored) return strict ? "unknown" : "accept";
  return stored === presented ? "accept" : "mismatch";
}

export function knownHostsPath(workbenchHome = resolveWorkbenchHome()): string {
  return join(workbenchHome, homeKnownHostsRel());
}

export function loadKnownHosts(filePath = knownHostsPath()): Map<string, string> {
  if (!existsSync(filePath)) return new Map();
  try {
    return parseKnownHosts(readFileSync(filePath, "utf8"));
  } catch {
    return new Map();
  }
}

export function trustHostKey(
  host: string,
  port: number,
  fingerprint: string,
  filePath = knownHostsPath(),
): void {
  const map = loadKnownHosts(filePath);
  map.set(hostKeyId(host, port), fingerprint);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, formatKnownHosts(map), "utf8");
}

export function checkStoredHostKey(
  host: string,
  port: number,
  presented: string,
  strict: boolean,
  filePath = knownHostsPath(),
): HostKeyDecision {
  const stored = loadKnownHosts(filePath).get(hostKeyId(host, port));
  return decideHostKey(stored, presented, strict);
}
