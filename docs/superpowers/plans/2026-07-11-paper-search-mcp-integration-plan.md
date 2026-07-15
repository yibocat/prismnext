# paper-search-mcp (Node.js) — Implementation Plan

**Goal:** Wire [paper-search-mcp-nodejs](https://github.com/Dianel555/paper-search-mcp-nodejs) as Prism’s curated MCP for external academic discovery via `npx` (no Python).

**Flow:** `search_papers` → `literature-stage` → `[n]` → (user) `literature-add`

**Tech:** TypeScript, existing MCP stack, Vitest.

## Tasks

- [x] Design (Option B, Node MCP)
- [x] `mcp-presets.ts` — Paper Search first, `npx -y paper-search-mcp-nodejs`
- [x] `project-mcp-defaults.ts` + `project:ensure` scaffold when empty
- [x] `discoveredFrom: "paper-search-mcp"`
- [x] Prompts + literature-stage workflowRules
- [x] Settings/catalog copy
- [x] Tests

## Manual E2E

1. Open/create project → `.prismnext/agent/mcp.json` has paper-search-mcp
2. New chat tab → ask for recent papers
3. Expect MCP tools (`paper-search-mcp_search_papers`), not websearch-first
4. Expect `literature-stage` before `[n]` cites
