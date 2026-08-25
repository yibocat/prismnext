/**
 * Resolved SSH target used by the session broker.
 * v1 hosts come from `~/.ssh/config` (`id` = Host alias). Nothing here is typed by the user in Settings.
 */

export interface SshProfile {
  id: string;
  name: string;
  host: string;
  /** Default 22. */
  port: number;
  user: string;
  /** Local private-key path. Prefer ssh-agent when omitted. */
  identityFile?: string;
  /** Single-hop jump via another saved profile. */
  jumpProfileId?: string;
  /** Unknown host keys must be confirmed. Default true. */
  strictHostKey: boolean;
}

const SECRET_KEYS = ["password", "passphrase", "privateKey", "privateKeyPem"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parsePort(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
  return n;
}

/** Drop secrets and coerce a stored / IPC blob into a profile, or null. */
export function sanitizeSshProfile(value: unknown): SshProfile | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const id = optionalString(rec.id);
  const name = optionalString(rec.name);
  const host = optionalString(rec.host);
  const user = optionalString(rec.user);
  const port = parsePort(rec.port) ?? 22;
  if (!id || !name || !host || !user) return null;

  const profile: SshProfile = {
    id,
    name,
    host,
    port,
    user,
    strictHostKey: rec.strictHostKey !== false,
  };
  const identityFile = optionalString(rec.identityFile);
  if (identityFile) profile.identityFile = identityFile;
  const jumpProfileId = optionalString(rec.jumpProfileId);
  if (jumpProfileId) profile.jumpProfileId = jumpProfileId;
  for (const key of SECRET_KEYS) {
    if (key in rec) {
      // Secrets are never copied onto the returned object.
    }
  }
  return profile;
}

export function sanitizeSshProfileList(value: unknown): SshProfile[] {
  if (!Array.isArray(value)) return [];
  const out: SshProfile[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const profile = sanitizeSshProfile(item);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
  }
  return out;
}
