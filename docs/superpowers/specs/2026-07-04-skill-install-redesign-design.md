# Skill Install Redesign — Design Spec

**Date:** 2026-07-04  
**Status:** Phase 1–3 implemented (GitHub + unified registry Analyze/Install, Reinstall, Check updates, digest verify)  
**Related:** `skills-registry.ts`, `skills-sync.ts`, `skill-library-panel.tsx`, `bundled-skills.ts`

## Problem statement

Today's Skills install UX assumes **Agent Skills Discovery** (`/.well-known/agent-skills/index.json`) is the primary distribution channel. That works for a handful of publisher sites (e.g. `developers.cloudflare.com`) but fails the common case:

| Real-world source | Example | Current Prism |
|-------------------|---------|---------------|
| GitHub monorepo of skill folders | [nature-skills](https://github.com/Yuan1z0825/nature-skills) | ❌ Cannot add as source; manual `cp -R` |
| Multi-file skill packages | `SKILL.md` + `static/` + `references/` + scripts | ⚠️ Registry install only if `files[]` or archive; Create skill = single file |
| Shared dependency dirs | `skills/_shared/` | ❌ No model |
| HTML skill directories | GuildSkills, skills.re | ❌ Wrong format |
| Discovery registries | Cloudflare, Supabase | ✅ Works |

We currently expose **five unrelated install paths**:

1. **Prism Curated** (bundled copy) — good  
2. **Browse Library → registry source → Install** — narrow  
3. **Create skill** (paste one `SKILL.md`) — loses attachments  
4. **Open folder** (manual copy) — power-user only  
5. **Agent bash** (user workaround) — fragile  

**Root issue:** conflating **discovery** (where skills are listed) with **installation** (copying a full skill directory tree into `.prismnext/agent/skills/<id>/`). Most ecosystems publish **directories**, not discovery indexes.

## Goals

1. **One mental model:** paste a link → pick skills → install full folders.  
2. **GitHub repos first-class** (nature-skills and similar).  
3. **Keep Discovery registries** as an adapter, not the whole product.  
4. **Preserve OpenCode layout:** install target remains `.prismnext/agent/skills/<id>/` with complete tree.  
5. **Record provenance** in manifest for reinstall/update later.  
6. **No project pollution:** still never write `.opencode/` into user projects.

## Non-goals (v1)

- Private GitHub auth / enterprise registries  
- Semver resolver or global skill lockfile  
- Running upstream install scripts (`update-codex-skills.sh`) automatically  
- Replacing Prism Curated bundled catalog  
- Indexing GuildSkills / skills.re (different schema; separate project if ever)

---

## Recommended architecture: Install adapters

Unify behind a single main-process module `skill-install.ts` with **source adapters** that all output the same artifact: `SkillPackage[]`.

```text
User URL or picker
       ↓
 resolveSkillSource(input)
       ↓
 ┌──────────┬────────────┬──────────┬─────────────┐
 │ bundled  │ discovery  │ github   │ direct-url  │
 └──────────┴────────────┴──────────┴─────────────┘
       ↓
 listInstallablePackages()  →  UI checklist
       ↓
 installSkillPackages(project, selections)
       ↓
 cpSync trees → .prismnext/agent/skills/
 record provenance in skills-manifest.json
 refreshProjectSkillsIntegration()
```

### Adapter: `discovery` (existing)

- Input: hostname or `index.json` URL  
- Logic: `validateRegistryIndex` + `parseRegistryIndex` + `installRegistrySkill`  
- Supports: skill-md, multi-file (`files[]`), archive tar/zip  
- **Change:** treat as adapter only; demote in UI from primary to "Publisher registries"

### Adapter: `github` (new — priority)

**Input patterns:**

```text
https://github.com/Yuan1z0825/nature-skills
https://github.com/Yuan1z0825/nature-skills/tree/main/skills/nature-reader
Yuan1z0825/nature-skills@main
```

**Fetch strategy (no `git clone` required):**

```text
GET https://codeload.github.com/{owner}/{repo}/tar.gz/{ref}
→ extract to temp
→ scan layout
```

Public repos only in v1. Uses existing `tar` dependency.

**Layout detection (first match wins):**

| Priority | Condition | Packages offered |
|----------|-----------|------------------|
| 1 | URL path points to directory containing `SKILL.md` | Single skill + optional repo `_shared` |
| 2 | `{root}/skills/*/SKILL.md` | All skill subdirs (nature-skills layout) |
| 3 | `{root}/.well-known/agent-skills/index.json` | Delegate to `discovery` on raw GitHub URL |
| 4 | `{root}/*/SKILL.md` (depth 1) | Top-level skill folders |
| 5 | Single `SKILL.md` at repo root | One skill named from frontmatter or repo |

**Special cases:**

- **`skills/_shared/`** — no `SKILL.md`; classify as **dependency bundle**, not a standalone skill. UI: checkbox "Include shared files (`_shared`)" default **on** when present.  
- **Folders without `SKILL.md`** — skip in list.  
- **`scripts/` at repo root** — never auto-run; show note in UI if `requirements.txt` found under selected skills.

**Install:**

```text
cpSync(srcDir, project/.prismnext/agent/skills/{folderName}, { recursive: true })
```

Folder name = directory name (`nature-reader`), not frontmatter `name` (must match disk for OpenCode).

### Adapter: `direct-url` (new — thin)

- Input: `https://…/something.tar.gz` or raw `SKILL.md` URL  
- Archive → same extract path as registry archive  
- Single md → install with **warning** if content references local paths (`static/`, `references/`)

### Adapter: `bundled` (existing)

- Unchanged: `copyBundledSkillToProject`

---

## Manifest provenance

Extend `.prismnext/agent/skills-manifest.json`:

```json
{
  "disabled": ["some-skill"],
  "sources": [ "... existing library sources ..." ],
  "installs": [
    {
      "skillId": "nature-reader",
      "origin": {
        "adapter": "github",
        "repo": "Yuan1z0825/nature-skills",
        "ref": "main",
        "path": "skills/nature-reader"
      },
      "installedAt": "2026-07-04T00:00:00.000Z",
      "contentVersion": "2.0.0"
    }
  ]
}
```

`contentVersion` from `SKILL.md` frontmatter when present.

**v1 uses provenance for:** display in Installed list ("from GitHub …"), reinstall same version.  
**v2:** "Check for updates" (re-fetch tarball, compare digest or version).

Removing a skill removes its `installs[]` entry.

---

## UI redesign

### Rename & restructure

| Today | Proposed |
|-------|----------|
| Browse library | **Install skills** (right panel) |
| Library sources (primary) | **Install from URL** (primary) |
| Recommended sources | Quick links: Cloudflare Docs, **nature-skills (GitHub)**, Supabase |
| Browse skills grid | Split: **Curated catalog** + **From URL results** + **Registry catalogs** (connected sources) |

### Primary flow — Install from URL

```text
┌─────────────────────────────────────────────────────────┐
│ Paste GitHub repo, registry host, or direct archive URL  │
│ [ Analyze ]                                             │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ Detected: GitHub · Yuan1z0825/nature-skills · main    │
│ ☑ Include shared files (_shared)                        │
│ ☑ nature-reader        Full-paper Markdown reader…     │
│ ☑ nature-writing       …                                 │
│ … (15 skills)                    [ Select all ]         │
│ [ Install selected (3) ]                                │
└─────────────────────────────────────────────────────────┘
```

After install: toast + link to Installed list; remind **new chat tab**.

### Installed list enhancements

- Badge: `Curated` | `GitHub` | `Registry` | `Custom`  
- Action: **Reinstall** (if provenance known) | **Open folder** | **Edit** | Delete  
- Footnote when skill has `requirements.txt`: "Extra Python deps may be required — see README"

### Keep existing flows

- **Create skill** — single-file author path; unchanged  
- **Open folder** — power users  
- **Registry sources** — advanced; auto-fetch catalogs for Cloudflare-style sites  

---

## IPC surface (proposed)

```text
agent:analyzeSkillSource(input: string)
  → { adapter, label, packages: SkillPackageOption[], sharedBundle?, warnings[] }

agent:installSkillPackages(projectPath, selections: InstallSelection[])
  → refresh result + installed ids

agent:listSkillLibrarySources / agent:addSkillLibrarySource
  → unchanged (registry browsing)
```

Types:

```typescript
interface SkillPackageOption {
  id: string;           // folder name / install dir
  name: string;         // from frontmatter or id
  description: string;
  path: string;         // path within source root
  hasRequirements: boolean;
}

interface InstallSelection {
  packageId: string;
  includeShared?: boolean;  // github adapter
  origin: SkillInstallOrigin;
}
```

---

## nature-skills walkthrough (target UX)

1. Settings → Skills → **Install skills**  
2. Paste `https://github.com/Yuan1z0825/nature-skills` → **Analyze**  
3. UI lists 15 `nature-*` skills; `_shared` auto-checked  
4. User selects `nature-reader` + `nature-citation` → **Install selected**  
5. Project contains:
   - `.prismnext/agent/skills/_shared/…`
   - `.prismnext/agent/skills/nature-reader/…`
   - `.prismnext/agent/skills/nature-citation/…`
6. New chat tab → agent can invoke skills  

Optional README note in success toast if MCP deps detected.

---

## Approaches considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. GitHub panel only** | Fast to ship | Doesn't unify; registries still separate product | Too narrow |
| **B. Unified URL + adapters** | One UX; extensible | More design upfront | **Recommended** |
| **C. Full package manager** | Updates, semver | Heavy; premature | Defer |

---

## Implementation phases

### Phase 1 — GitHub adapter + Install from URL panel (MVP)

- `skill-install-github.ts`: parse URL, codeload tarball, scan `skills/`, install with `_shared`  
- New panel section or replace top of `skill-library-panel.tsx`  
- IPC: `analyzeSkillSource`, `installSkillPackages`  
- Manifest `installs[]` write on install  
- Preset quick link: nature-skills  
- Tests: URL parse, layout scan (fixture tarball in `tests/fixtures/`)

### Phase 2 — Unified resolver

- Single input routes to github | discovery | direct-url  
- Merge analyze results UI  
- Reinstall button on Installed rows  

### Phase 3 — Updates & polish ✅

- Check for updates (compare ref/version)  
- Digest verify for discovery installs (optional)  
- Better errors (404 repo, private repo, rate limit)

Implemented: `agent:checkSkillUpdates`, manifest `contentDigest` / `registryDigest` / `packagePath`, Installed **Check updates** + **Update** badge/button, `skill-install-digest.ts`.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| GitHub rate limits | Cache tarball in app temp; show clear error |
| Huge repos | Shallow single-ref tarball only; warn if > N MB |
| `_shared` listed as skill in UI | Only show in dependency checkbox, not skill list |
| Skill scripts execute on install | Never run upstream scripts; document manual pip install |
| Name collision on install | Prompt: skip / replace / rename folder |

---

## Open question for product

**Default for nature-skills-style repos:** when user analyzes full repo, should **Select all** be the default CTA, or require explicit checkbox per skill?

Recommendation: **explicit selection** (empty checkboxes, Select all button) — 15 skills × large trees is heavy; user usually wants 1–3.

---

## Approval checklist

- [ ] Unified adapter architecture approved  
- [ ] UI: "Install from URL" as primary, registries demoted  
- [ ] GitHub via codeload tarball (no git clone) approved  
- [ ] Manifest `installs[]` provenance approved  
- [ ] Phase 1 scope approved (GitHub + nature-skills preset)
