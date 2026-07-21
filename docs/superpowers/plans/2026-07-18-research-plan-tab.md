# Research Plan Tab — Implementation Plan

> **For agentic workers:** Implement per this plan; design is in `docs/superpowers/specs/2026-07-18-research-plan-tab-design.md`.

**Goal:** Plan files open as dedicated `research-plan` tabs (hidden mode, Files editor reuse, Plan-only toolbar).

## Tasks

1. Add `research-plan` kind + `isEditableFileTabKind` + layout mode id
2. Register `research-plan-mode` (FilesContent + PlanDraftToolbar, no mode-toolbar button)
3. `openResearchPlan` + redirect from `openFile` / chat open helpers
4. Wire editor/save/close/dirty like file tabs; remove right-area Plan bolt-on
5. i18n + changelog + tests
