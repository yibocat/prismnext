# Template System Hardening — Design Spec

**Date:** 2026-06-23  
**Status:** Approved for implementation

## Goal

Harden the template lifecycle: single source of truth for project template state, one apply pipeline, honest merge/replace strategies by category, safer IPC, and consistent UX with TeX Workspace.

## Scope

### In scope

1. **Project template state** — load/save `.prismnext/settings.json.template` via shared module + hook
2. **applyTemplateFlow** — all Use / switch / reset / firstUse paths
3. **Merge strategy** — section merge only for `paper` and `thesis`; `letter` / `beamer` / `poster` / `cv` are replace-only
4. **Preamble merge** — preserve abstract / pre-section content on paper/thesis merge
5. **IPC** — path validation, staging apply, restore metadata, manifest error handling
6. **UX** — manuscript gate, loading gate, toasts, no forced navigation to sessions
7. **Tests** — merge strategy + project template state

### Out of scope

- Beamer frame-level merge, letter full-document merge
- Auto-migrate files when manuscript folder is renamed
- Track user-added files outside `appliedFiles`
- Template catalog hot-reload

## Data model

### Project template state (`.prismnext/settings.json`)

```json
{
  "template": {
    "id": "academic-paper",
    "category": "paper",
    "appliedAt": "2026-06-23T12:00:00.000Z",
    "appliedFiles": {
      "main.tex": "sha256:…",
      "references.bib": "sha256:…"
    }
  }
}
```

### Backup manifest (`.prismnext/backups/{label}/manifest.json`)

```json
{
  "backupLabel": "…",
  "timestamp": "…",
  "files": ["main.tex"],
  "sourceTemplateId": "academic-paper",
  "targetTemplateId": "phd-thesis"
}
```

Legacy backups without `sourceTemplateId` / `targetTemplateId` are parsed from directory label when possible.

## Switch strategy matrix

| Condition | Dialog level | Actions |
|-----------|--------------|---------|
| No template + no overlapping files | — | Direct apply |
| No template + overlapping files | `firstUse` | Replace only (backup first) |
| Same id + no changes | — | Toast "Already current" |
| Same id + changes | `reset` | Replace only |
| Different id + no changes | — | Silent apply |
| Different id + changes, both paper/thesis family | `L1` or `L2` | Merge or replace |
| Different id + changes, either side non-merge category | `L3` | Replace only |

**Non-merge categories:** `letter`, `beamer`, `poster`, `cv`

**L2 pair:** `paper` ↔ `thesis`

## Apply flow state machine

```
Use clicked
  → gate: projectRoot, manuscriptConfig, template state loaded
  → fetch TemplateFull
  → if no currentTemplate:
       overlap check → firstUse dialog OR direct apply
  → if same id:
       detectChanges → noop toast OR reset dialog
  → if different id:
       detectChanges → silent apply OR strategy dialog
  → on confirm: backup → merge|replace → apply → reload state → clearPdfCache → refreshFiles
```

## IPC contract

| Channel | Hardening |
|---------|-----------|
| `template:apply` | Validate relative paths; stage under `.prismnext/.template-staging/` then commit; atomic settings write |
| `template:detectChanges` | Unchanged |
| `template:backup` | Path validation; extended manifest fields |
| `template:restoreBackup` | Restore `template.id` / `category` from manifest or label |
| `template:get` | try/catch on manifest parse |

## Boundaries with TeX Workspace

- Template Center **writes** manuscript files and settings
- TeX Workspace **reads** manuscript for edit/compile
- TeX Workspace Settings shows current template via `useProjectTemplate` (read-only) + link to Template Center
- Backups panel uses same `template:*` IPC

## Known limitations

- Renaming manuscript folder in Workspace does not migrate template files or `appliedFiles` paths
- User-created files not in `appliedFiles` survive switches but are not tracked for reset/detection
