# Desktop notifications & Tray — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and wire General → Desktop notifications + Tray (hide-on-close, minimal menu, status).

**Architecture:** Main-process `desktop-notifications` + `tray` services; settings keys; renderer reports tray status and request notifications on turn complete / action required; `BrowserWindow` close intercepted when tray enabled.

**Tech Stack:** Electron `Notification`, `Tray`, `Menu`, `nativeImage`; existing settings store + IPC; i18next copy.

**Spec:** `docs/superpowers/specs/2026-07-17-desktop-notifications-tray-design.md`

---

## File map

| File | Role |
|------|------|
| `src/main/services/desktop-notifications.ts` | `notifyIfBackground`, focus helpers |
| `src/main/services/tray.ts` | create/destroy tray, menu, status, `shouldHideOnClose` |
| `src/main/index.ts` | close/hide, activate show, before-quit flag, init tray |
| `src/main/ipc/settings.ts` | react to tray/notif setting patches |
| `src/main/ipc/shell.ts` (or window) | `shell:setTrayStatus`, `shell:notify` |
| `src/main/services/settings.ts` + renderer store | new booleans |
| `src/preload/index.ts` + `electron.d.ts` | API surface |
| `general-settings.tsx` | bind toggles + i18n |
| `locales/{en,zh-CN,zh-HK}.json` | copy |
| `resources/tray/*.png` | idle / busy / attention template icons |
| hooks / chat / permission UI | call notify + setTrayStatus |
| `tests/main/…` | pure helpers (dedupe, hide policy) |

---

### Task 1: Settings keys + i18n + General UI

- [x] Add `desktopNotifications?: boolean` (default `true`) and `trayIconEnabled?: boolean` (default `true`) to main + renderer settings
- [x] Update `general-settings.tsx`: remove local-only state; persist via `updateSettings`; rename labels/descriptions (cross-platform)
- [x] Update en / zh-CN / zh-HK strings

**Verify:** Settings round-trip in UI (toggle → reload → state kept).

### Task 2: Tray service + close/hide

- [x] Implement `tray.ts`: create/destroy, Show/Quit menu, status icons, `getIsQuitting` / `setQuitting`
- [x] Wire `main/index.ts`: on `close`, if tray on && !quitting → preventDefault + hide; `activate` shows hidden window; sync tray on settings change
- [x] Ensure hide does **not** run `closed` dispose; Quit sets quitting then quits

**Verify:** Manual: tray on → close window → process alive → Show restores; Quit exits. Tray off → close quits.

### Task 3: Desktop notifications service

- [x] Implement `desktop-notifications.ts` with focus/hidden check + dedupe
- [x] IPC `shell:desktopNotify` from renderer
- [x] Click → show window (+ optional focus chat tab)

**Verify:** Unfocused + agent complete → toast; focused → no toast; toggle off → no toast.

### Task 4: Status + event wiring

- [x] Renderer: when any tab streaming / permission pending → `shell:setTrayStatus`
- [x] On turn complete / permission ask while background → `shell:desktopNotify`
- [x] Notification click focuses chat tab via `shell:focusChatTab`

**Verify:** Hide app, run agent → busy icon; permission ask → attention + notification.

### Task 5: Tests + docs touch-up

- [x] Unit tests for hide policy / notify gate / dedupe (`tests/shared/desktop-shell.test.ts`)
- [x] Spec + plan written; commit when user asks

---

## Notes

- Do **not** expand application menu in this plan.
- Prefer reporting from renderer for tray status (has chat-store + permission UI); keep Notification creation in main.
