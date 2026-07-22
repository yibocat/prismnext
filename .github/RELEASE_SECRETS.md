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

### Updater feed URL at build time

Packaged apps resolve the default electron-updater generic feed from a **build-time** constant (`__PRISM_UPDATER_BASE_URL__`), not from user settings.

- **Release workflow:** sets `PRISM_UPDATER_BASE_URL: ${{ secrets.R2_PUBLIC_BASE_URL }}` on build/package steps (same value as `R2_PUBLIC_BASE_URL`).
- **Local dist:** export the same URL before `pnpm build` / `pnpm dist`, e.g. `PRISM_UPDATER_BASE_URL=https://pub-xxx.r2.dev pnpm dist:mac`.
- **Runtime override:** optional settings key `updateSource` can still override the baked default for advanced QA (not shown in About UI).

When both the baked default and `updateSource` are empty (typical unsigned local dev without env), About shows **no-source**.

## Optional (P4 signing)

| Name | Purpose |
|------|---------|
| `CSC_LINK` | Windows cert (base64 or file protocol as used by electron-builder) |
| `CSC_KEY_PASSWORD` | Windows cert password |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | macOS notarization |

## Cloudflare Pages (download site)

1. Workers & Pages → Create → Connect to Git → `yibocat/prismnext`
2. Production branch: `master`
3. **Root directory:** `website`
4. Build command: empty (or `exit 0`)
5. Deploy → open the `*.pages.dev` URL

### R2 CORS (required for the download page)

The Pages site fetches `version.json` from the R2 public URL (cross-origin).
In the bucket **Settings → CORS Policy**, add a rule that allows GET from browsers, e.g.:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3600
  }
]
```

Later you can replace `*` with your exact `https://….pages.dev` origin.

### GitHub Releases

The Release workflow also creates a **GitHub Release** (right-hand Releases list)
with the same installers attached. Collaborators on the private repo can see it;
it does not replace R2 as the updater feed.

**Release notes** come from the changelog (not a hardcoded blurb):

1. Version `X.Y.Z` → series file `changelog/X.Y.x.md`  
   (e.g. `0.5.14` → `0.5.x.md`, `0.6.0` → `0.6.x.md`, `2.1.3` → `2.1.x.md`)
2. Extract the `## X.Y.Z …` section (`— date` or `(Unreleased)` headings both work)
3. If the series file is missing, fall back to `changelog/CHANGELOG.md`
4. Append a short Downloads / R2 footer

Before tagging: ensure that section exists. Dry-run locally:

```bash
node scripts/release/extract-changelog-section.mjs 0.5.14
```
