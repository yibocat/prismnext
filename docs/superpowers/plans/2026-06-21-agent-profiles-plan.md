# Agent Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce Agent Profiles that bundle prompt/instruction packs for main chat sessions and OpenCode subagents, with UI in Settings → Agent and chat composer selectors.

**Architecture:** Bundled profiles in `resources/profiles/`; project manifest at `.prismnext/agent/profiles-manifest.json`; sync to `.opencode/agents/` (subagent) and `.opencode/modes/` (main); prompt overlay layer for active main profile; delegate mode wraps prompts for task-tool subagent dispatch.

**Tech Stack:** Electron main services, PromptComposer layer, Zustand chat store, React dropdown selectors

---

## Delivered in this change

- [x] Profile schema + 3 bundled profiles
- [x] `profiles-sync.ts` + IPC + prewarm integration
- [x] `profile-overlay` prompt layer
- [x] Chat: ProfileSelect + DelegateSelect
- [x] Settings → Agent page
- [x] Tests: `tests/main/profiles-sync.test.ts`

## Follow-ups (post-V1)

- [ ] Custom profile editor (create `.prismnext/agent/profiles/custom/`)
- [ ] Per-profile MCP/skill hard filtering at session level
- [ ] Profile library marketplace (like Skill library)
- [ ] Persist active profile per session on reload
