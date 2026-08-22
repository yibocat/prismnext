import { getUserDataPath } from "../app/paths";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ActivateLicenseResult, LicenseSnapshot } from "../../shared/pro";
import {
  isLicenseActive,
  validateActivationKey,
} from "../../shared/pro";

function licensePath(): string {
  return join(getUserDataPath(), "pro", "license.json");
}

function ensureDir(): void {
  mkdirSync(join(getUserDataPath(), "pro"), { recursive: true });
}

export function readProLicense(): LicenseSnapshot | null {
  const path = licensePath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as LicenseSnapshot;
    if (!raw || typeof raw.key !== "string" || raw.plan !== "pro") return null;
    if (!isLicenseActive(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeProLicense(license: LicenseSnapshot): void {
  ensureDir();
  writeFileSync(licensePath(), `${JSON.stringify(license, null, 2)}\n`, "utf8");
}

export function clearProLicense(): void {
  const path = licensePath();
  if (existsSync(path)) unlinkSync(path);
}

export function activateProLicense(rawKey: string): ActivateLicenseResult {
  const result = validateActivationKey(rawKey);
  if (!result.ok) return result;
  writeProLicense(result.license);
  return result;
}
