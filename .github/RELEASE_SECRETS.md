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
- **Runtime override:** Settings → About **Update source** (`updateSource`) still overrides the baked default for advanced QA.

When both the baked default and `updateSource` are empty (typical unsigned local dev without env), About shows **no-source**.

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
