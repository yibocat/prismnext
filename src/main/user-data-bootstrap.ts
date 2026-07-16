/**
 * MUST be imported first from `index.ts` (before settings / logger / ACP).
 *
 * Sole canonical userData directory:
 *   ~/Library/Application Support/prismnext/   (macOS)
 *   %APPDATA%\prismnext\                       (Windows)
 *   ~/.config/prismnext/                       (Linux)
 *
 * App display name is always `prismnext`. Legacy Application Support folders
 * (`prism-next`, and the mistaken spaced name) are renamed here once so
 * settings/sessions stay in one place.
 */
import { app } from "electron";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const APP_NAME = "prismnext";
const appData = app.getPath("appData");
const CANONICAL_USER_DATA = join(appData, APP_NAME);

/** On-disk folder names created by older builds — do not "fix" the spaced one. */
const LEGACY_USER_DATA_DIRS = ["prism-next", "Prism Next"] as const;

function migrateLegacyUserData(): void {
  if (existsSync(CANONICAL_USER_DATA)) return;
  for (const legacy of LEGACY_USER_DATA_DIRS) {
    const from = join(appData, legacy);
    if (!existsSync(from)) continue;
    try {
      renameSync(from, CANONICAL_USER_DATA);
      return;
    } catch {
      // Fall through — still pin to canonical path below.
    }
  }
}

migrateLegacyUserData();
app.setPath("userData", CANONICAL_USER_DATA);
app.setName(APP_NAME);
