# Permission Gate Architecture

Prism delegates tool execution to OpenCode. OpenCode calls ACP `requestPermission`; Prism responds once per request. The renderer never re-decides allow/deny.

## Flow

```
OpenCode → custom bash.ts blocks until .permission.json approved
         → (optional) ACP requestPermission OR EventMapper bash tool_call
         → chat:permission → PermissionGatePanel
         → answerPermission → write .permission.json + runAiBashJob (main)
         → bash.ts polls result.json → tool completes
```

**Why tool_call sync exists:** OpenCode's custom tools (`bash`, `delete`, `move`) may invoke `execute()` before ACP `requestPermission`. Builtin tools integrate with OpenCode permission; custom tools poll the file bridge. Main process `syncBashPermissionFromToolCall` / `syncCustomToolPermissionFromToolCall` bridge tool_call events to the same gate.

## Modes

| Mode | edit/write | bash | delete/move | read/grep |
|------|------------|------|-------------|-----------|
| Ask | prompt (composer gate) | prompt + PTY after Allow | prompt | allow |
| Auto | allow (no gate) | prompt + PTY after Allow | prompt | allow |
| Read-only | deny | deny | deny | allow |

## Scheme A (Ask edits)

Permission **Allow** authorizes OpenCode to write disk. Widgets show diff preview only — no `ChangeReviewBar` second accept.

## Single approval path

All UI must call `finalizePermissionAllow` / `finalizePermissionDeny` in `permission-actions.ts`. Do not call `chatAnswerPermission` from components.

## Registry

Tool rules and UI metadata live in `src/main/services/tool-permission-registry.ts`. `permission-modes.ts` and `tool-meta.ts` read from it.

## Settings

Changing **permission mode** restarts OpenCode (`reloadAfterPermissionModeChange`). Start a new chat tab if an active session stops responding.
