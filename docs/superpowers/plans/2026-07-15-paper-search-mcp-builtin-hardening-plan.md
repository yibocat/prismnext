# Paper Search MCP Builtin Hardening — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Hot-reload MCP into open sessions; never allowlist-exclude built-in. Launch stays `npx` (no app bundle).

**Architecture:** `applyProjectMcp` refreshes cache + `session/load` per project session; allowlist merge forces `paper-search-mcp`. Command always `npx -y paper-search-mcp-nodejs`.

**Tech Stack:** Electron main, ACP `session/load`, Vitest

---

### Task 1: Allowlist exemption — done
### Task 2: Apply / hot reload — done
### Task 3: Bundled launch — **cancelled** (product: no install-package embed)
### Task 4: Light health copy (npx) — done

---
