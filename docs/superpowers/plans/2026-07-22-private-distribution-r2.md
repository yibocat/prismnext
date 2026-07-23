# Private Distribution (GitHub + R2) + electron-updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Private-repo CI builds installers to Cloudflare R2; ship a minimal `website/` download page; evolve the existing update checker into `electron-updater` one-click updates (generic → R2).

**Architecture:** electron-builder `publish.provider: generic` points at an R2 public HTTPS root. GitHub Actions (tag / workflow_dispatch) builds mac+win, uploads artifacts + `latest*.yml`. App uses `electron-updater` against that root; About UI gains download progress + install. `website/` is a static Pages site in-repo (scheme A).

**Tech Stack:** GitHub Actions, pnpm, electron-builder, electron-updater, Cloudflare R2 (S3 API) + Pages, existing `update-checker` / `about-settings` / IPC `update:*`

**Spec:** `docs/superpowers/specs/2026-07-22-private-distribution-r2-design.md`

## Global Constraints

- Repo stays **private**; artifacts are **not** published to public GitHub Releases.
- R2 access model **P1** (public-read URL); no invite-code system in v1.
- First-class platforms: **macOS + Windows**; Linux builder config may remain, CI optional.
- Code signing/notarization is **Phase P4**; P3 must degrade gracefully (check + download path works).
- Do **not** gitignore all of `docs/` (spec D8). Keep `docs/superpowers/` tracked.
- Changelog bullets go under next **`(Unreleased)`** section in `changelog/0.5.x.md` (not under already-shipped `0.5.14`).
- Prefer domain homes: updater logic in `src/main/services/` (evolve `update-checker.ts` or replace in-place); IPC in `src/main/ipc/update.ts`; About UI in `about-settings.tsx`. No one-off `chat-first-*.ts` style files.
- `electron-builder` is **not** yet in `package.json` — must be added as a devDependency with `dist` scripts.
- OpenCode binaries: CI must run `./scripts/download-opencode.sh` (or matrix-equivalent) before packaging so `bin/opencode/<platform>-<arch>/` exists for `extraResources`.

---

## File map (create / modify)

| Path | Role |
|------|------|
| `website/index.html` (+ optional `website/styles.css`) | Minimal download landing page |
| `website/version.json` | Optional: `{ "version", "macUrl", "winUrl" }` written by CI or hand-edited for P1 |
| `.github/workflows/release.yml` | Tag / manual build → R2 upload |
| `electron-builder.yml` | Add `publish` generic URL |
| `package.json` | `electron-builder`, `electron-updater`, `dist` / `dist:mac` / `dist:win` scripts |
| `src/main/services/update-checker.ts` → evolve or split `app-updater.ts` | electron-updater wiring; keep `compareVersions` tests |
| `src/main/ipc/update.ts` | New channels: download / install / progress events |
| `src/preload/index.ts` + `src/renderer/types/electron.d.ts` | Expose new update APIs |
| `src/renderer/components/modules/settings/about-settings.tsx` | Progress + Install buttons |
| `tests/main/update-checker.test.ts` (or extend existing) | Semver + status mapping |
| `changelog/0.5.x.md` | Unreleased notes |
| `.github/RELEASE_SECRETS.md` | Checklist of Cloudflare / signing secrets (not secret values) |

---

### Task 1: Cloudflare + secrets checklist (P0, human + doc)

**Files:**
- Create: `.github/RELEASE_SECRETS.md`

**Interfaces:**
- Produces: documented env var names consumed by Task 4 workflow

- [ ] **Step 1: Create the secrets checklist** (no real keys in git)

```markdown
# Release secrets checklist

## Cloudflare (required for P2+)

1. Create R2 bucket, e.g. `prismnext-releases`.
2. Enable public access **or** attach a custom domain / r2.dev public URL to the bucket prefix used for updates.
3. Create R2 API token with Object Read & Write on that bucket.
4. Note the S3 API endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

### GitHub Actions secrets

| Name | Purpose |
|------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | R2 token access key |
| `R2_SECRET_ACCESS_KEY` | R2 token secret |
| `R2_BUCKET` | Bucket name |
| `R2_PUBLIC_BASE_URL` | HTTPS root electron-updater + website links, no trailing slash — e.g. `https://pub-xxx.r2.dev` or `https://releases.example.com` |

## Optional (P4 signing)

| Name | Purpose |
|------|---------|
| `CSC_LINK` | Windows cert (base64 or file protocol as used by electron-builder) |
| `CSC_KEY_PASSWORD` | Windows cert password |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | macOS notarization |

## Cloudflare Pages

- Project root directory: `website`
- Production branch: same as app default branch
- No build command if pure static HTML; or `exit 0` if needed
```

- [ ] **Step 2: Human — create R2 bucket + token; add GitHub secrets**

Verify manually: upload a tiny `ping.txt` via dashboard or `aws s3 cp` against the R2 endpoint; open `R2_PUBLIC_BASE_URL/ping.txt` in a browser → 200.

- [ ] **Step 3: Commit checklist only**

```bash
git add .github/RELEASE_SECRETS.md
git commit -m "$(cat <<'EOF'
docs(release): add Cloudflare R2 / Actions secrets checklist

EOF
)"
```

---

### Task 2: Minimal `website/` download page (P1)

**Files:**
- Create: `website/index.html`
- Create: `website/version.json`
- Create: `website/styles.css` (optional; keep tiny)

**Interfaces:**
- Consumes: `version.json` shape `{ "version": string, "macUrl": string, "winUrl": string, "notes"?: string }`
- Produces: static site Cloudflare Pages can deploy from `website/`

- [ ] **Step 1: Add `website/version.json` placeholder** (CI will overwrite later; hand-edit OK for first publish)

```json
{
  "version": "0.0.0-dev",
  "macUrl": "#",
  "winUrl": "#",
  "notes": "Set real R2 URLs after first release upload."
}
```

- [ ] **Step 2: Add `website/index.html`** — one composition: product name, one line, two download buttons, version label. Fetch `version.json` and wire hrefs. No auth, no cards grid, no purple marketing kit — match existing brand tokens lightly (neutral, use `resources/brand` colors if referenced as hex from brand system; keep CSS minimal).

Essential JS behavior:

```javascript
async function load() {
  const res = await fetch("./version.json", { cache: "no-store" });
  const v = await res.json();
  document.getElementById("version").textContent = v.version;
  const mac = document.getElementById("dl-mac");
  const win = document.getElementById("dl-win");
  mac.href = v.macUrl;
  win.href = v.winUrl;
  if (v.notes) document.getElementById("notes").textContent = v.notes;
}
load();
```

- [ ] **Step 3: Local verify**

Run: `npx --yes serve website -p 4173`  
Open `http://localhost:4173` — version text visible; buttons present.

- [ ] **Step 4: Commit**

```bash
git add website/
git commit -m "$(cat <<'EOF'
feat(website): add minimal download landing page

EOF
)"
```

- [ ] **Step 5: Human — connect Cloudflare Pages to private repo, root `website/`**  
Accept: `*.pages.dev` URL works.

---

### Task 3: electron-builder + publish config + package scripts (P2 prep)

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Test: local dry-run build on one platform when binaries present

**Interfaces:**
- Produces: `pnpm dist:mac` / `pnpm dist:win` invoking electron-vite build + electron-builder
- `publish.url` must equal `R2_PUBLIC_BASE_URL` (can use env `UPDATER_BASE_URL` at build time)

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm add -D electron-builder
pnpm add electron-updater
```

Expected: both appear in `package.json` lockfile updated.

- [ ] **Step 2: Add scripts to `package.json`**

```json
"dist": "pnpm build && electron-builder --publish never",
"dist:mac": "pnpm build && electron-builder --mac --publish never",
"dist:win": "pnpm build && electron-builder --win --publish never",
"dist:dir": "pnpm build && electron-builder --dir --publish never"
```

- [ ] **Step 3: Extend `electron-builder.yml`** with publish block (URL is overridden in CI via env if needed):

```yaml
publish:
  provider: generic
  url: https://REPLACE_WITH_R2_PUBLIC_BASE_URL
  channel: latest
```

Keep existing `mac` / `win` / `linux` / `extraResources` / `artifactName` intact.

Prefer reading URL from env in CI by generating a small override file or using:

```bash
# in workflow, before electron-builder:
export UPDATER_BASE_URL="${R2_PUBLIC_BASE_URL}"
# and in electron-builder.yml use a documented placeholder that the workflow
# rewrites with `yq`/`sed`, OR pass:
# electron-builder --config.publish.url="$R2_PUBLIC_BASE_URL"
```

**Required in workflow (Task 4):** always pass `--config.publish.url="$R2_PUBLIC_BASE_URL"` so the committed placeholder never ships as the live update root by mistake. Local `dist:*` uses `--publish never` (no upload).

- [ ] **Step 4: Smoke local package (macOS host example)**

```bash
./scripts/download-opencode.sh
pnpm dist:mac
```

Expected: `dist/prismnext-<version>-arm64.dmg` (or x64) exists; build may also emit `latest-mac.yml` under `dist/`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml electron-builder.yml
git commit -m "$(cat <<'EOF'
build: add electron-builder scripts and generic publish stub

EOF
)"
```

---

### Task 4: GitHub Actions release → R2 (P2)

**Files:**
- Create: `.github/workflows/release.yml`
- Modify (optional helper): `scripts/upload-r2.sh` or inline AWS CLI in workflow

**Interfaces:**
- Consumes: secrets from Task 1
- Produces: objects at `$R2_PUBLIC_BASE_URL/` including installers + `latest-mac.yml` / `latest.yml` (Windows)
- Also updates `website/version.json` in the deployment artifact **or** uploads `version.json` to R2 and have the site point at it — prefer **commit-less**: upload `version.json` next to artifacts on R2, and change website fetch to `${R2_PUBLIC_BASE_URL}/version.json` **or** keep site-local file updated via a Pages-only path. Simplest v1: workflow uses `aws s3 cp` to upload installers + yml, then writes/uploads `version.json` to R2; `website/index.html` fetches absolute URL from a small `website/config.js` generated at…  

**v1 decision (lock):**  
- Installers + `latest*.yml` live on R2 public root.  
- `website/version.json` is **uploaded to R2** as `version.json` at the same public root.  
- `website/index.html` reads version from a meta tag default **and** tries `window.__RELEASES_BASE__ + '/version.json'` where `__RELEASES_BASE__` is a one-line `website/config.js`:

```javascript
// website/config.js — committed default; override in Pages env later if needed
window.__RELEASES_BASE__ = "https://REPLACE_WITH_R2_PUBLIC_BASE_URL";
```

Human replaces once; or Pages build substitutes. Avoid needing a second git commit per release.

- [ ] **Step 1: Write `.github/workflows/release.yml`**

Requirements:

- `on: push.tags: ["v*"]` + `workflow_dispatch` with optional `tag` input  
- Matrix: `macos-latest` (mac build), `windows-latest` (win build)  
- Steps per job: checkout → setup pnpm + Node 22 → `pnpm install` → `./scripts/download-opencode.sh` → `pnpm build` → `pnpm exec electron-builder --<mac|win> --publish never --config.publish.url="$R2_PUBLIC_BASE_URL"`  
- Install AWS CLI v2; configure:

```bash
aws configure set aws_access_key_id "${{ secrets.R2_ACCESS_KEY_ID }}"
aws configure set aws_secret_access_key "${{ secrets.R2_SECRET_ACCESS_KEY }}"
aws configure set region auto
```

- Upload:

```bash
ENDPOINT="https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com"
aws s3 cp dist/ "s3://${{ secrets.R2_BUCKET }}/" \
  --endpoint-url "$ENDPOINT" \
  --recursive \
  --exclude "*" \
  --include "*.dmg" --include "*.exe" --include "*.yml" --include "*.blockmap"
```

- After both jobs (use a final job `needs: [mac, win]` or upload version.json from each with care): write `version.json`:

```json
{
  "version": "<tag without v>",
  "macUrl": "<R2_PUBLIC_BASE_URL>/<mac artifact name>",
  "winUrl": "<R2_PUBLIC_BASE_URL>/<win artifact name>",
  "notes": ""
}
```

Upload that file to bucket root.

Artifact names must match `electron-builder.yml` `artifactName`: `${productName}-${version}-${arch}.${ext}`.

- [ ] **Step 2: Set `website/config.js` with real base URL** (once secrets known)

- [ ] **Step 3: Dry-run via `workflow_dispatch`** on a private branch/tag  
Expected: Actions green; browser can download DMG/EXE from public URL; `latest-mac.yml` / `latest.yml` fetchable.

- [ ] **Step 4: Commit workflow + config.js**

```bash
git add .github/workflows/release.yml website/config.js
git commit -m "$(cat <<'EOF'
ci: add private release workflow uploading installers to R2

EOF
)"
```

---

### Task 5: Main-process electron-updater service (P3)

**Files:**
- Modify: `src/main/services/update-checker.ts` (preferred: evolve in place) **or** Create `src/main/services/app-updater.ts` and thin-wrap from update-checker
- Modify: `src/main/index.ts` (or wherever services boot) to call `initAppUpdater()` once
- Create/Modify: `tests/main/update-checker.test.ts` for pure helpers
- Modify: `src/main/services/settings.ts` — `updateSource` becomes optional override; default feed URL from build-time `import.meta.env` / `process.env.UPDATER_BASE_URL` / constant baked via electron-vite `define`

**Interfaces:**
- Consumes: generic feed at `UPDATER_BASE_URL` (same as R2 public root)
- Produces:

```ts
export type UpdaterStatus =
  | { status: "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error" | "no-source"; currentVersion: string; latestVersion?: string; progress?: { percent: number }; error?: string; releaseNotes?: string };

export function initAppUpdater(): void;
export function checkForUpdates(): Promise<UpdaterStatus>;
export function downloadUpdate(): Promise<UpdaterStatus>;
export function quitAndInstall(): void;
export function getUpdaterStatus(): UpdaterStatus;
export function ignoreVersion(version: string): void;
export function unignoreVersion(): void;
```

Keep exporting `compareVersions` for tests.

- [ ] **Step 1: Write failing tests for `compareVersions`** (if not already present)

```ts
import { describe, it, expect } from "vitest";
import { compareVersions } from "../../src/main/services/update-checker";

describe("compareVersions", () => {
  it("orders semver", () => {
    expect(compareVersions("0.5.15", "0.5.14")).toBe(1);
    expect(compareVersions("0.5.14", "0.5.14")).toBe(0);
    expect(compareVersions("0.5.13", "0.5.14")).toBe(-1);
  });
});
```

Run: `pnpm exec vitest run tests/main/update-checker.test.ts`  
Expected: FAIL if file/export missing; PASS after wiring.

- [ ] **Step 2: Implement updater with electron-updater**

Sketch (adapt to Electron 35 + electron-updater API):

```ts
import { autoUpdater } from "electron-updater";
import { app } from "electron";

const DEFAULT_FEED =
  process.env.PRISM_UPDATER_BASE_URL?.replace(/\/$/, "") ||
  /* build-time define */ (globalThis as any).__PRISM_UPDATER_BASE_URL__ ||
  "";

export function initAppUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  const feed = getSettings().updateSource?.trim() || DEFAULT_FEED;
  if (feed) {
    autoUpdater.setFeedURL({ provider: "generic", url: feed });
  }
  autoUpdater.on("download-progress", (p) => {
    /* update cached status + webContents.send("update:progress", p) */
  });
  autoUpdater.on("update-downloaded", () => {
    /* status downloaded */
  });
}

export async function checkForUpdates(): Promise<UpdaterStatus> {
  // if no feed → no-source
  // autoUpdater.checkForUpdates() → map UpdateCheckResult
  // honor ignoredUpdateVersion
}
```

**Unsigned / dev fallback:** if `!app.isPackaged`, return a clear `error` or keep JSON-manifest path for local QA — do not crash. When packaged but update download fails due to signature, surface `error` with message; About still offers `shell.openExternal(latestHtmlUrl)` only if feed provides path — for generic provider, construct download URL from `version.json` or artifact name as last resort (optional).

- [ ] **Step 3: Wire `initAppUpdater()` after `app.whenReady()`** in main entry.

- [ ] **Step 4: Run unit tests**

```bash
pnpm exec vitest run tests/main/update-checker.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/update-checker.ts src/main/index.ts tests/main/update-checker.test.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(updater): wire electron-updater generic provider to R2 feed

EOF
)"
```

---

### Task 6: IPC + preload + About UI (P3)

**Files:**
- Modify: `src/main/ipc/update.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `src/renderer/components/modules/settings/about-settings.tsx`
- Modify: i18n `en.json` / `zh-CN.json` / `zh-HK.json` keys for download progress / install / restart

**Interfaces:**
- IPC:
  - `update:check` → status
  - `update:download` → starts download
  - `update:install` → `quitAndInstall()`
  - `update:status` → cached
  - `update:ignore` / `update:unignore` (keep)
  - event `update:progress` → `{ percent: number }`
- Preload: `updateCheck`, `updateDownload`, `updateInstall`, `onUpdateProgress`

- [ ] **Step 1: Extend IPC handlers** to call download/install; forward progress via `BrowserWindow.webContents.send` or `webContents` of focused window / all windows — match existing chat event patterns in this codebase.

- [ ] **Step 2: Update preload + `electron.d.ts`**

- [ ] **Step 3: About UI states**

| status | UI |
|--------|-----|
| checking | spinner (existing) |
| up-to-date | existing |
| available | **Download update** (calls `updateDownload`) + skip |
| downloading | progress percent |
| downloaded | **Restart to install** (`updateInstall`) |
| error | message + optional open download page |
| no-source | existing empty-source hint |

Replace `shell:openExternal` primary path with in-app download when packaged; keep external open as secondary if `latest.path` / macUrl available.

- [ ] **Step 4: Manual QA on packaged build**  
Install build N; upload build N+1 to R2 (or local generic server); check → download → install → version bump.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/update.ts src/preload/index.ts src/renderer/types/electron.d.ts src/renderer/components/modules/settings/about-settings.tsx src/renderer/lib/i18n/locales/*.json
git commit -m "$(cat <<'EOF'
feat(updater): About UI download progress and quit-and-install

EOF
)"
```

---

### Task 7: Changelog + bake default updater URL (P3 wrap)

**Files:**
- Modify: `changelog/0.5.x.md` — create `## 0.5.15 (Unreleased)` if missing
- Modify: electron-vite / main define for `PRISM_UPDATER_BASE_URL` so packaged apps do not require users to paste manifest URL (About field remains advanced override via `updateSource`)

- [ ] **Step 1: Add Unreleased bullets** (user effect)

```markdown
## 0.5.15 (Unreleased)

### Distribution & updates

- Private GitHub Actions release uploads macOS/Windows installers to Cloudflare R2
- In-app one-click updates via electron-updater (generic feed)
- Minimal download page under `website/` for first-time installs
```

- [ ] **Step 2: Default feed** — packaged app uses build-time URL; empty `updateSource` means “use default”, not `no-source`. Only `no-source` when both default and override empty (dev unsigned without env).

- [ ] **Step 3: Commit**

```bash
git add changelog/0.5.x.md # + define wiring files
git commit -m "$(cat <<'EOF'
docs(changelog): note private R2 distribution and one-click updates

EOF
)"
```

---

### Task 8: Code signing / notarization (P4, optional gate)

**Files:**
- Modify: `.github/workflows/release.yml` env for CSC_* / Apple notarization
- Modify: `.github/RELEASE_SECRETS.md` with exact electron-builder notarize env names used

- [ ] **Step 1: Human — obtain Apple Developer ID + Windows Authenticode material; add secrets**

- [ ] **Step 2: Enable electron-builder signing in CI** (mac notarize after sign). Re-run release workflow.

- [ ] **Step 3: Verify Gatekeeper / SmartScreen path** — quitAndInstall without manual quarantine clear.

- [ ] **Step 4: Commit workflow/docs tweaks only**

```bash
git commit -m "$(cat <<'EOF'
ci(release): enable code signing and notarization for release builds

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| P0 R2 + secrets | Task 1 |
| P1 website/ | Task 2 |
| P2 Actions → R2 | Tasks 3–4 |
| P3 electron-updater + UI | Tasks 5–7 |
| P4 signing | Task 8 |
| Scheme A `website/` in-repo | Task 2 |
| generic publish / no public GH Release | Tasks 3–4 |
| Evolve update-checker, not parallel forever | Task 5–6 |
| D8 docs not fully gitignored | Global Constraints |

## Placeholder scan

No TBD steps; human Cloudflare/Apple steps are explicit checkboxes.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-private-distribution-r2.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session executes tasks with checkpoints  

Which approach?
