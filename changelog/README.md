# Changelog layout (prism-next)

This directory is the **source of truth** for GitHub Release “What’s new”.
The Release workflow extracts the section for the tagged version via
`scripts/release/extract-changelog-section.mjs`.

## Series files

| Versions | File |
|----------|------|
| `0.5.*` | [`0.5.x.md`](./0.5.x.md) |
| `0.6.*` | [`0.6.x.md`](./0.6.x.md) |
| `2.1.*` | `2.1.x.md` |

Rule: version **`X.Y.Z` → `X.Y.x.md`**.

[`CHANGELOG.md`](./CHANGELOG.md) keeps older / legacy history; prefer series files for current work.

## While developing

1. Read `package.json` → **current** version.
2. Append bullets under **`## next (Unreleased)`** in the matching series file — never under the already-shipped current version.
3. Prefer user-facing “why / effect”; skip pure typos unless asked.

Cursor agents: see `.cursor/rules/changelog-next-version.mdc` (same rules, always applied).

## On release

1. Bump `package.json`, rename `(Unreleased)` → `— YYYY-MM-DD`, tighten the section.
2. Tag / run Release — CI pastes that section into the GitHub Release body.

Dry-run:

```bash
node scripts/release/extract-changelog-section.mjs 0.5.14
```
