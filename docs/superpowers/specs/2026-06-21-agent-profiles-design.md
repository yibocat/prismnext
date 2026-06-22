# Agent Profiles Design

**Goal:** Bundle prompts, skills, MCP, modules, and rules into named **Profiles** — selectable for the main chat session and delegatable as subagents in conversation.

## Concepts

| Concept | Meaning |
|---------|---------|
| **Profile** | Named capability bundle (instructions + references to skills/MCP/modules) |
| **Main profile** | Active on a chat tab; injects prompt overlay into system prompt |
| **Subagent profile** | Synced to `.opencode/agents/<id>.md`; invoked via OpenCode `task` tool |
| **Primitives** | Existing Skills / MCP / Commands / Rules settings pages (unchanged) |

## Storage

```
resources/profiles/                    # Bundled (app)
  manifest.json
  academic-writer/
    profile.json
    instructions.md

.prismnext/agent/
  profiles-manifest.json               # { defaultMainProfileId, disabledBuiltinIds[] }
  profiles/custom/<id>/                # User-created profiles
    profile.json
    instructions.md

.opencode/                             # Synced for OpenCode runtime
  agents/<id>.md                       # subagent profiles
  modes/<id>.md                        # main profiles (future native mode)
```

## Profile schema (`profile.json`)

```typescript
interface AgentProfileDefinition {
  id: string;
  name: string;
  description: string;
  mode: "main" | "subagent";
  builtin?: boolean;
  skills?: string[];
  mcpServers?: string[];
  modules?: string[];
  permissions?: Record<string, unknown>;  // subagent OpenCode frontmatter
  model?: string;
  thoughtLevel?: string;
}
```

## Runtime

1. **Main session:** `ProfileSelect` in chat composer → per-tab `activeProfileId` → `buildPromptContext({ profileId })` → `profile-overlay` prompt layer.
2. **Subagent:** `syncProjectProfilesIntegration` writes `.opencode/agents/*.md`. Main agent delegates via Task tool. `DelegateSelect` in composer wraps prompt to request delegation.
3. **Settings → Agent:** List profiles, set project default main profile, enable/disable builtins.

## V1 scope

- 3 bundled profiles (1 main, 2 subagent)
- Profile select + delegate select in chat
- Agent settings page (read-only builtin management)
- Sync on prewarm / project open
- Tests for profiles-sync

## Out of scope (V1)

- Visual profile editor / marketplace
- Per-profile MCP/skill hard filtering at session level
- Profile persistence across session reload
