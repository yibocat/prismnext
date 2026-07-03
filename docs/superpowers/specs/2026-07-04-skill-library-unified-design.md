# Skill Library Unified Model — Design Spec

**Date:** 2026-07-04  
**Status:** Approved (user chose approach B)  
**Supersedes:** fragmented Install-from-GitHub + Browse Library UX in `skill-library-panel.tsx`

## Problem

Two install paradigms were merged incorrectly:

| Model | Flow | User expectation for nature-skills |
|-------|------|-----------------------------------|
| Library | Add source → Browse → Install one | ✅ nature-skills is a **source** |
| Batch import | Analyze → checkbox popup → install all | ❌ Should not be the primary path |

## Decision: One mental model

**All skills enter through Library sources → Browse library → Install (single).**

Optional secondary: **Install all** on a source row (GitHub monorepos).

## Source kinds

| kind | Example | Catalog load |
|------|---------|--------------|
| `bundled` | Prism Curated | Bundled skill list |
| `registry` | developers.cloudflare.com, agentskills.io | `fetchRegistryIndex` |
| `github` | github.com/Yuan1z0825/nature-skills | Tarball scan (`skills/*/SKILL.md`) |

Manifest (`skills-manifest.json` `sources[]`):

```json
{
  "id": "github:Yuan1z0825/nature-skills@main",
  "kind": "github",
  "repo": "Yuan1z0825/nature-skills",
  "ref": "main",
  "subPath": "",
  "connected": true
}
```

Registry sources keep `kind: "registry"` (alias read: legacy `"remote"`).

## UI (single panel)

1. **Library sources** — one input + Add source (GitHub or registry URL); preset quick-add for nature-skills only.
2. Source list — Prism Curated (built-in, always connected), user-added sources with Connect/Disconnect/Remove.
3. GitHub sources — secondary **Install all** button on source row.
4. **Browse library** — search + grid; every skill Install installs one package.
5. **Remove** Analyze popup / separate Install-from-GitHub section.

## Presets policy

| Preset | Keep? |
|--------|-------|
| Prism Curated | Yes (built-in) |
| nature-skills | Yes (GitHub quick-add) |
| Cloudflare / Supabase | Remove from default UI (still work via custom URL) |
| agentskills.io | Not a catalog hub; optional custom URL only |

## IPC

- `agent:addSkillLibrarySource` — accept GitHub or registry input; return `{ sources, packageCount, kind }`
- `agent:fetchSkillLibraryCatalog` — `{ projectPath, sourceId }` → catalog items for grid
- `agent:installSkillFromLibrary` — single install from catalog item metadata
- `agent:installAllFromLibrarySource` — GitHub/registry bulk (secondary)

## Non-goals

- Private GitHub auth
- Replacing Phase 3 update checks / provenance (`installs[]` still written on install)
