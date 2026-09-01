import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeHostModelKeyMap } from "../shared/remote";
import { HOME_HOST_MODEL_FILENAME } from "../shared/workbench/paths";
import { resolveWorkbenchHome } from "../main/workbench/home";
import { setHostTavilyApiKey } from "../main/lib/tavily/settings";

export type HostModelSettings = {
  aiApiKeys?: Record<string, string>;
  aiBaseUrls?: Record<string, string>;
  tavilyApiKey?: string;
};

const ALG = "aes-256-gcm";
const AAD = Buffer.from("prismnext-host-model-v1");
const WRAP_BYTES = 32;

type HostModelEnvelope = {
  version: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

let unlocked: HostModelSettings = {};
let wrapKeyBytes: Buffer | null = null;

function hostModelPath(): string {
  return join(resolveWorkbenchHome(), HOME_HOST_MODEL_FILENAME);
}

function asUrlMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [id, url] of Object.entries(value as Record<string, unknown>)) {
    const provider = id.trim();
    if (!provider || typeof url !== "string" || !url.trim()) continue;
    out[provider] = url.trim();
  }
  return out;
}

export function decodeHostModelWrapKey(value: unknown): Buffer | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const buf = Buffer.from(value.trim(), "base64");
    return buf.length === WRAP_BYTES ? buf : null;
  } catch {
    return null;
  }
}

function isEnvelope(value: unknown): value is HostModelEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return rec.version === 1
    && rec.alg === ALG
    && typeof rec.iv === "string"
    && typeof rec.tag === "string"
    && typeof rec.data === "string";
}

function encryptPayload(plain: HostModelSettings, key: Buffer): HostModelEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(AAD);
  const json = Buffer.from(JSON.stringify(plain), "utf8");
  const data = Buffer.concat([cipher.update(json), cipher.final()]);
  return {
    version: 1,
    alg: ALG,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

function decryptEnvelope(envelope: HostModelEnvelope, key: Buffer): HostModelSettings | null {
  try {
    const decipher = createDecipheriv(ALG, key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const json = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    const aiApiKeys = sanitizeHostModelKeyMap(rec.aiApiKeys);
    const aiBaseUrls = asUrlMap(rec.aiBaseUrls);
    const tavilyApiKey = typeof rec.tavilyApiKey === "string" ? rec.tavilyApiKey.trim() : "";
    return {
      ...(Object.keys(aiApiKeys).length > 0 ? { aiApiKeys } : {}),
      ...(Object.keys(aiBaseUrls).length > 0 ? { aiBaseUrls } : {}),
      ...(tavilyApiKey ? { tavilyApiKey } : {}),
    };
  } catch {
    return null;
  }
}

function readDiskRecord(): unknown | null {
  try {
    return JSON.parse(readFileSync(hostModelPath(), "utf8")) as unknown;
  } catch {
    return null;
  }
}

function settingsFromLegacyPlain(value: unknown): HostModelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value) || isEnvelope(value)) return {};
  const rec = value as Record<string, unknown>;
  const aiApiKeys = sanitizeHostModelKeyMap(rec.aiApiKeys);
  const aiBaseUrls = asUrlMap(rec.aiBaseUrls);
  const tavilyApiKey = typeof rec.tavilyApiKey === "string" ? rec.tavilyApiKey.trim() : "";
  return {
    ...(Object.keys(aiApiKeys).length > 0 ? { aiApiKeys } : {}),
    ...(Object.keys(aiBaseUrls).length > 0 ? { aiBaseUrls } : {}),
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
  };
}

function mergeMaps(base: HostModelSettings, extra: HostModelSettings): HostModelSettings {
  const aiApiKeys = { ...base.aiApiKeys, ...extra.aiApiKeys };
  const aiBaseUrls = { ...base.aiBaseUrls, ...extra.aiBaseUrls };
  const tavilyApiKey = extra.tavilyApiKey !== undefined
    ? extra.tavilyApiKey.trim()
    : (base.tavilyApiKey ?? "");
  return {
    ...(Object.keys(aiApiKeys).length > 0 ? { aiApiKeys } : {}),
    ...(Object.keys(aiBaseUrls).length > 0 ? { aiBaseUrls } : {}),
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
  };
}

function writeEnvelope(plain: HostModelSettings, key: Buffer): void {
  const path = hostModelPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(encryptPayload(plain, key), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Host is Linux; chmod failing must not block the turn.
  }
}

/** Test-only: drop in-memory unwrap state. */
export function resetHostModelSettingsForTests(): void {
  unlocked = {};
  wrapKeyBytes = null;
  setHostTavilyApiKey(undefined);
}

export function readHostModelSettings(): HostModelSettings {
  return {
    ...(unlocked.aiApiKeys ? { aiApiKeys: { ...unlocked.aiApiKeys } } : {}),
    ...(unlocked.aiBaseUrls ? { aiBaseUrls: { ...unlocked.aiBaseUrls } } : {}),
    ...(unlocked.tavilyApiKey ? { tavilyApiKey: unlocked.tavilyApiKey } : {}),
  };
}

/**
 * Merge keys into process memory. With a 32-byte wrap key, persist AES-256-GCM
 * ciphertext only — never plaintext. The wrap key stays on the laptop.
 */
export function mergeHostModelSettings(
  patch: HostModelSettings,
  wrapKey?: string,
): HostModelSettings {
  const incoming: HostModelSettings = {
    aiApiKeys: sanitizeHostModelKeyMap(patch.aiApiKeys),
    aiBaseUrls: asUrlMap(patch.aiBaseUrls),
  };
  if (patch.tavilyApiKey !== undefined) incoming.tavilyApiKey = patch.tavilyApiKey;
  const decoded = decodeHostModelWrapKey(wrapKey);
  if (decoded) wrapKeyBytes = decoded;
  const key = wrapKeyBytes;

  const disk = readDiskRecord();
  const fromDisk = key && isEnvelope(disk)
    ? decryptEnvelope(disk, key) ?? {}
    : settingsFromLegacyPlain(disk);
  const next = mergeMaps(mergeMaps(fromDisk, unlocked), incoming);
  unlocked = next;

  const hasSecrets = Boolean(next.aiApiKeys && Object.keys(next.aiApiKeys).length > 0);
  const hasUrls = Boolean(next.aiBaseUrls && Object.keys(next.aiBaseUrls).length > 0);
  const hasTavily = Boolean(next.tavilyApiKey);
  if (key && (hasSecrets || hasUrls || hasTavily)) writeEnvelope(next, key);
  setHostTavilyApiKey(next.tavilyApiKey);
  return readHostModelSettings();
}
