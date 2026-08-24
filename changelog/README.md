# Changelog layout (prism-next)

This directory holds **two tracks** of release history:

| Track | Path | Audience | CI / GitHub Release |
|-------|------|----------|---------------------|
| **Detailed dev log** | [`series/`](./series/) | Contributors, agents, archaeology | No |
| **Release notes** | [`releases/`](./releases/) | End users on GitHub Releases | **Yes** |

[`CHANGELOG.md`](./CHANGELOG.md) keeps 0.4.x and older history.

## Directory layout

```text
changelog/
  README.md           ← this file
  CHANGELOG.md        ← legacy (0.4.x and earlier)
  series/
    0.5.x.md          ← detailed bullets while developing 0.5.*
    0.6.x.md
    0.7.x.md
    0.8.x.md          ← current work → ## 0.8.0 (Unreleased)
  releases/
    0.8.0.md          ← summarized notes for GitHub Release
```

Rule: version **`X.Y.Z` → series file `series/X.Y.x.md`**.

## While developing

1. Read `package.json` → **current** shipped version.
2. Append bullets under **`## next (Unreleased)`** in the matching **series** file — never under the already-shipped version.
3. Write **why / user effect**; put file-path noise under `### Developer` or `### Architecture` (those sections are omitted from Release notes).
4. Cursor agents: `.cursor/rules/changelog-next-version.mdc`.

Example (current line): work goes in `series/0.8.x.md` under `## 0.8.0 (Unreleased)`.

## Before tagging a release

1. Bump `package.json` to the release version.
2. In the series file: rename `## X.Y.Z (Unreleased)` → `## X.Y.Z — YYYY-MM-DD` (keep the **full** detailed text).
3. **Regenerate** the summarized release file:

```bash
pnpm release:changelog 0.8.0
```

4. **Edit** `releases/0.8.0.md` if the auto-summary needs tightening (intro, merge themes, drop noise).
5. Tag / run Release — CI extracts **`releases/X.Y.Z.md`**, not the series file.

Dry-run extraction (same as Release workflow):

```bash
pnpm release:changelog:extract 0.8.0
```

Fallback order if `releases/X.Y.Z.md` is missing: `series/X.Y.x.md` section → legacy `X.Y.x.md` at repo root → `CHANGELOG.md`.

## Series file index

| Versions | Series file |
|----------|-------------|
| `0.5.*` | [`series/0.5.x.md`](./series/0.5.x.md) |
| `0.6.*` | [`series/0.6.x.md`](./series/0.6.x.md) |
| `0.7.*` | [`series/0.7.x.md`](./series/0.7.x.md) |
| `0.8.*` | [`series/0.8.x.md`](./series/0.8.x.md) |

When starting a **new minor** (e.g. first `0.9.0` work), create `series/0.9.x.md` — do not keep writing into the previous series file.
