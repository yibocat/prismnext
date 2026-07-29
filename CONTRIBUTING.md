# Contributing to PrismNext

Thanks for helping improve PrismNext. This guide is for people working on **this repository** (the Electron app), not end-user project rules inside `.prismnext/`.

## Ways to contribute

- Bug reports and reproducible install / update issues
- Feature ideas that fit the local-first research loop (literature → design → experiment → LaTeX)
- Pull requests with focused changes and clear rationale

Please open an issue before large architectural work so we can align on direction.

## Development setup

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm test
```

Package manager is **pnpm**. Prefer matching the existing layout under `src/main/`, `src/renderer/`, and `tests/` rather than adding one-off helper files.

## Pull requests

1. Keep the diff scoped to one concern.
2. Prefer user-facing behavior and tests over drive-by refactors.
3. If the change is user-facing or otherwise noteworthy, append a short bullet under the next `## X.Y.Z (Unreleased)` section in `changelog/{major}.{minor}.x.md` (see `.cursor/rules/changelog-next-version.mdc`). Do **not** edit the section that already matches `package.json` version.
4. Fill out the PR template.

## Issues

Use the issue templates when possible:

- **Bug** — steps, expected vs actual, OS / app version
- **Feature** — problem, proposed shape, why it fits PrismNext

Security vulnerabilities: do **not** open a public issue. See [SECURITY.md](./SECURITY.md).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE).

Copyright is stated in [NOTICE](./NOTICE). Keep the official `LICENSE` text unchanged. When applying the Apache APPENDIX boilerplate to new source files, use:

```text
Copyright 2026 yibocat
```
