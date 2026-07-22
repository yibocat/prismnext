# Security Policy

## Supported versions

PrismNext is in early access. We primarily support the **latest released** version from GitHub Releases / the in-app updater feed. Please upgrade before reporting issues that may already be fixed.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security reports.

Preferred options:

1. **GitHub Private Vulnerability Reporting** (if enabled on this repository): use the Security tab → *Report a vulnerability*.
2. **Email:** [yibocat@yeah.net](mailto:yibocat@yeah.net) with subject prefix `[PrismNext Security]`.

Include as much as you can:

- Affected version / platform (macOS / Windows)
- Impact (data exposure, remote code, privilege escalation, etc.)
- Steps to reproduce or a proof of concept
- Whether you plan to disclose publicly and on what timeline

We will acknowledge receipt when we can, assess the report, and coordinate a fix / disclosure window. Please give us reasonable time before public disclosure.

## Scope notes

- PrismNext is **local-first** and uses **BYOK** model credentials. Treat API keys and project files on disk as sensitive.
- Reports about third-party model providers, OpenCode upstream, or dependency CVEs are welcome when they affect this app’s packaging or defaults; we may redirect pure upstream issues to the relevant project.
