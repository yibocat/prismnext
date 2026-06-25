# Commands Settings Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Custom Commands settings from inline forms to the Settings right detail panel, matching Prompts & Rules / Agent profile UX. No command-kind UI yet — field parity only.

**Architecture:** Extend `SettingsPanelSlot` with `custom-command`; add `CustomCommandEditorPanel`; slim `commands-settings.tsx` to list + `openSettingsPanel`; refresh list on panel close. Reuse existing `command-store` CRUD IPC.

**Tech Stack:** React 19, Zustand (`command-store`, `settings-panel-store`), existing `CommandRegistry` / `commands:*` IPC.

**Spec:** `docs/superpowers/specs/2026-06-25-commands-settings-redesign.md` (Phase 1 section only)

---

### Task 1: Slot types & panel title

**Files:**
- Modify: `src/renderer/lib/settings/settings-panel-slots.ts`

- [ ] **Step 1:** Add slot variants:

```ts
| { kind: "custom-command"; mode: "new" }
| { kind: "custom-command"; mode: "edit"; commandId: string; title?: string }
```

- [ ] **Step 2:** `settingsPanelSlotTitle`:
  - `new` → `"New command"`
  - `edit` → `title ?? "/{name}"` or `"Command"`

- [ ] **Step 3:** Run `npx tsc --noEmit` — expect PASS

---

### Task 2: Custom command editor panel

**Files:**
- Create: `src/renderer/components/modules/settings/custom-command-editor-panel.tsx`
- Reference: `src/renderer/components/modules/settings/project-rule-editor-panel.tsx`

- [ ] **Step 1:** Props `{ slot: Extract<SettingsPanelSlot, { kind: "custom-command" }> }`

- [ ] **Step 2:** Form state: `name`, `description`, `template`

- [ ] **Step 3:** Load on mount (`edit`):
  - Read from `useCommandStore((s) => s.commands)` by `commandId`
  - If missing → toast + `closeSettingsPanel()`

- [ ] **Step 4:** Validation:
  - Name: `/^[a-z0-9-]+$/` (or match existing create validation in store)
  - Non-empty description + template
  - Disable Save when invalid

- [ ] **Step 5:** Save:
  - `new` → `createCommand({ name, description, template })`
  - `edit` → `updateCommand(commandId, { name, description, template })`
  - `loadCommands()` after save
  - toast success + `closeSettingsPanel()`

- [ ] **Step 6:** Cancel → `closeSettingsPanel()`

- [ ] **Step 7:** Edit mode Delete → Dialog (same pattern as project-rule); `deleteCommand` + close

- [ ] **Step 8:** UI tokens:
  - `SETTINGS_DETAIL_SHELL`, `SettingsFormField`, `SETTINGS_FORM_INPUT`, `SETTINGS_FORM_TEXTAREA`
  - Help line under template: `$ARGUMENTS`, `@path/to/file`, `` !`shell` `` (shell runs at expand time)

- [ ] **Step 9:** Actions row at bottom (`SETTINGS_DETAIL_ACTIONS`): Save, Cancel, Delete (edit only)

---

### Task 3: Wire settings detail panel

**Files:**
- Modify: `src/renderer/components/modules/settings/settings-detail-panel.tsx`

- [ ] **Step 1:** Import `CustomCommandEditorPanel`

- [ ] **Step 2:** `renderSlot` case `"custom-command"`

- [ ] **Step 3:** `npx tsc --noEmit` — PASS

---

### Task 4: Slim commands settings list

**Files:**
- Modify: `src/renderer/components/modules/settings/commands-settings.tsx`

- [ ] **Step 1:** Remove state: `expandedId`, `showAddForm`, `editName`, `editDescription`, `editTemplate`, `renderForm`, `handleSave`, `openCommand`, `cancelForm`

- [ ] **Step 2:** Import `openSettingsPanel`, `useSettingsPanelStore`

- [ ] **Step 3:** `useEffect` — when slot transitions from `custom-command` → `null`, call `loadCommands()`

- [ ] **Step 4:** Custom commands rows — Agent-settings row layout:

```tsx
<div className={ROW}>
  <div className="min-w-0 flex-1 pr-4">
    <p className={ROW_LABEL}>/{cmd.name}</p>
    <p className={ROW_DESC}>{cmd.description}</p>
  </div>
  <div className="flex items-center gap-2 shrink-0">
    <Button variant="ghost" size="xs" className="shrink-0" onClick={() => openSettingsPanel({ kind: "custom-command", mode: "edit", commandId: cmd.id, title: cmd.name })}>
      Edit
    </Button>
    <InlineDeleteButton ... />
  </div>
</div>
```

- [ ] **Step 5:** Replace `+ Add custom command` with:

```tsx
openSettingsPanel({ kind: "custom-command", mode: "new" })
```

- [ ] **Step 6:** Keep built-in section unchanged (toggles)

- [ ] **Step 7:** No project root gate for custom commands list if engine already returns empty without project (match current behavior)

---

### Task 5: Manual verification

- [ ] Open project → Settings → Commands
- [ ] Add command via right panel → file appears under `.prismnext/agent/commands/{name}.md`
- [ ] Chat `/` menu lists command; sending expands template
- [ ] Edit updates file; Delete removes file
- [ ] Built-in toggles still persist via `builtinCommands` settings
- [ ] `npx tsc --noEmit`

---

## Phase 2+ backlog (do not implement in Phase 1)

- Command kind selector (Prompt vs Shell capture field)
- Export/import commands pack
- Action kind + `ActionCatalog` for Settings dropdown
- Skill frontmatter `commands: [...]` reference
- Toolbar-style Save/Cancel in subtoolbar (optional UX polish)

---

## Self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Right panel CRUD | Tasks 2–4 |
| Remove inline forms | Task 4 |
| Agent-settings button style | Task 4 |
| List refresh on panel close | Task 4 |
| Kind A/B/C documented, not in Phase 1 UI | Backlog |
| Export/import | Backlog Phase 2 |
| Skills invoke commands | Backlog Phase 4 |
