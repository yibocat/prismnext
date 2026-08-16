# Unified release checklist

## Release ownership

PrismNext ships **one official desktop package**. It contains the private Pro
module at build time; free features work without a key and a license unlocks
the Pro features already in that package.

The public Host repository never checks out Pro source or holds R2 publishing
credentials. A protected Host tag creates a short-lived GitHub App token that
only dispatches the exact tag metadata to private `prismnext-pro`; private CI
then builds the unified package, uploads it, and creates the public GitHub
Release.
The website uses only `pro/stable/version.json`, so beta releases never replace
its stable download links or offer a separate Free/Pro choice.

## Cloudflare (required for P2+)

1. Create R2 bucket, e.g. `prismnext-releases`.
2. Enable public access **or** attach a custom domain / r2.dev public URL to the bucket prefix used for updates.
3. Create R2 API token with Object Read & Write on that bucket.
4. Note the S3 API endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

### Private `prismnext-pro` GitHub Environment secrets

Put these in the private repository's `pro-release` Environment, not in the
public Host repository. Jobs that read them must set `environment: pro-release`
(package and publish). They should target this same public bucket so the
website and packaged updater use one feed.

| Name | Purpose |
|------|---------|
| `PUBLIC_R2_ACCOUNT_ID` | Cloudflare account id |
| `PUBLIC_R2_ACCESS_KEY_ID` | R2 token access key |
| `PUBLIC_R2_SECRET_ACCESS_KEY` | R2 token secret |
| `PUBLIC_R2_BUCKET` | Bucket name |
| `PUBLIC_R2_PUBLIC_BASE_URL` | HTTPS root for the download site and updater, no trailing slash |
| `HOST_RELEASE_TOKEN` | Fine-grained token scoped only to public `yibocat/prismnext`, Contents: Read and write; lets private CI attach installers to the public Release |

### Public `prismnext` dispatch Environment secrets

Create a GitHub Environment named `pro-release-dispatch`, restricted to
protected release tags. It contains the GitHub App identity used only to start
the private build; it has no R2 access and does not expose Pro source.

1. Create a GitHub App such as `PrismNext Release Dispatcher`.
2. Install it **only** on private `yibocat/prismnext-pro`.
3. Grant its repository permission `Contents: Read and write`, which GitHub
   requires to create a `repository_dispatch` event.
4. Do not configure a webhook URL: the Host GitHub Action initiates dispatch.
5. Add the following Environment secrets in public `yibocat/prismnext`:

| Name | Purpose |
|------|---------|
| `PRISMNEXT_RELEASE_APP_ID` | GitHub App ID |
| `PRISMNEXT_RELEASE_APP_PRIVATE_KEY` | GitHub App private key PEM |

`request-pro-release.yml` mints a token that expires after one hour and can
address only the private Pro repository installation.

### Updater feed URL at build time

Packaged apps resolve the default electron-updater generic feed from a **build-time** constant (`__PRISM_UPDATER_BASE_URL__`), not from user settings.

- **Private release workflow:** beta builds bake `${PUBLIC_R2_PUBLIC_BASE_URL}/pro/beta`; stable builds bake `${PUBLIC_R2_PUBLIC_BASE_URL}/pro/stable`.
- **Existing OSS installs:** the private stable job also mirrors installers and updater manifests to the R2 root, allowing the unchanged `com.prism-next.app` to upgrade in place to the unified package.
- **Local dist:** export the intended feed before `pnpm build` / `pnpm dist`, e.g. `PRISM_UPDATER_BASE_URL=https://pub-xxx.r2.dev/pro/beta pnpm dist:mac`.
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
6. **Not Found Handling:** None (do not enable Single-page application). Missing paths should serve `website/404.html`, not the homepage. `website/_redirects` also forces `/* → /404.html` with HTTP 404.

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

The private release workflow creates the **public `yibocat/prismnext` GitHub
Release** with the same installers attached. The private repository only keeps
an internal build record. R2 remains the updater feed and website source.

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
