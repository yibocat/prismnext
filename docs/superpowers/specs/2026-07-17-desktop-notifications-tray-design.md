# Desktop notifications & Tray — Design

**Date:** 2026-07-17  
**Status:** Approved for implementation (phase 1)  
**Out of scope this phase:** Application menu expansion (File/Open/Settings/Window) — deferred to a follow-up

## Goal

Wire the two General settings toggles that are currently UI-only:

1. **Desktop notifications** — OS-level alerts when the user is not looking at the window
2. **Tray icon** — persistent status-bar / system-tray shortcut with hide-on-close

## Settings model

Persisted in electron-store / settings store (same path as other app settings):

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `desktopNotifications` | `boolean` | `true` | Allow OS notifications |
| `trayIconEnabled` | `boolean` | `true` | Show Tray; enables hide-on-close |

General UI:

- Rename copy from “conversation notifications” / “menu bar icon” to cross-platform wording
- Bind switches to persisted settings (not local React state)
- Descriptions mention macOS menu bar / Windows tray / Linux status area

i18n keys under `settings.general.*` (en / zh-CN / zh-HK).

## Desktop notifications

### Stack

Electron main-process `Notification` (Notification Center / Action Center / libnotify).

### When to notify

Only if **all** hold:

1. `desktopNotifications === true`
2. App supports notifications (`Notification.isSupported()`)
3. Main window is **not focused**, or window is **hidden** (in tray)
4. Event is one of:
   - Agent turn **completed** (reply finished)
   - User **action required** (permission gate or agent question)

Do **not** notify for: streaming tokens, tool heartbeats, compile (v1), every tool call.

### Content

| Event | Title | Body |
|-------|-------|------|
| Turn complete | Session / tab title (fallback “prismnext”) | Short summary or “Reply finished” |
| Action required | Session / tab title | “Needs your approval” / “Needs your answer” |

Click notification → show + focus main window (and best-effort focus the relevant chat tab via existing IPC/events if available; otherwise just show window).

### Deduping

- Coalesce: same tab + same kind within a short window (e.g. 2s) → one notification
- Clear or replace pending “action required” when user returns to the window (optional nice-to-have)

### Platform notes

- macOS: user may need System Settings → Notifications → prismnext
- Windows: toast / Action Center
- Linux: depends on DE; degrade gracefully if unsupported

## Tray icon

### Stack

Electron `Tray` + `Menu` in main process. Single module, e.g. `src/main/services/tray.ts` (or `desktop-shell.ts` if shared with notifications).

### Lifecycle

| Setting | Behavior |
|---------|----------|
| `trayIconEnabled: true` | Create tray; **close window = hide** (do not destroy); process keeps running |
| `trayIconEnabled: false` | Destroy tray; **close window = quit** (current behavior) |

Quit paths:

- Tray menu **Quit** → set `isQuitting`, destroy tray, `app.quit()`
- macOS App menu Quit / `Cmd+Q` → same (`before-quit` sets quitting flag so close is not intercepted as hide)

### Close / hide (decision B)

On `BrowserWindow` `close` event:

```
if (trayIconEnabled && !isQuitting) {
  event.preventDefault()
  win.hide()
  return
}
// else: allow close → existing closed cleanup (dispose chat, PTYs, etc.)
```

Important: today’s `closed` handler disposes ACP/chat/terminals. **Hide must not fire `closed`.** Real quit still runs existing cleanup via `closed` and/or `before-quit`.

`window-all-closed`:

- With tray + hidden window, a window object still exists → do not auto-quit
- When tray off and last window closed → quit (non-mac as today; mac dock activate can recreate)

`activate` / dock click: if window exists but hidden → `show()` + `focus()`; if none → `createWindow()`.

### Tray menu (decision A — v1)

- **Show prismnext** → show + focus window  
- **Quit** → quit app  

No recent chats, no new chat, no mode shortcuts in v1.

### Tray status (v1)

Three visual states via icon and/or tooltip:

| State | When | Presentation |
|-------|------|--------------|
| Idle | No streaming; no pending permission/question | Default tray icon |
| Busy | Any chat tab `isStreaming` | Alternate icon or tooltip “Working…” |
| Needs attention | Pending permission or agent question | Alternate icon or tooltip “Needs attention” |

Priority: **needs attention > busy > idle**.

Renderer (or main, if it already sees ACP events) reports status to main via IPC, e.g. `shell:setTrayStatus`. Main owns icon swap.

### Icons

Ship small PNGs under e.g. `resources/tray/` (template images for macOS `setTemplateImage(true)`). If branded assets are missing initially, generate simple monochrome marks from the app mark or a geometric glyph — must look acceptable in dark/light menu bars.

### Windows / Linux

Same Tray API. Tooltip + context menu. No “close to tray” setting toggle beyond `trayIconEnabled`.

## Architecture

```
Renderer                          Main
────────                          ────
settings.desktopNotifications  →  electron-store
settings.trayIconEnabled       →  tray create/destroy + close policy
chat complete / permission     →  shell:notify (or main observes ACP)
tray status (busy/attention)   →  shell:setTrayStatus
Notification click             →  window show (+ optional tab focus event)
```

Prefer a small main-process facade:

- `src/main/services/desktop-notifications.ts` — notify helpers + focus check  
- `src/main/services/tray.ts` — tray lifecycle, menu, status icons  
- Wire from `src/main/index.ts` (close/hide, activate, before-quit)  
- IPC in `src/main/ipc/` (extend window or new `shell`/`desktop` domain)  
- Preload + `electron.d.ts` surface  

Domain home: main shell services (not one-off patch files). Settings UI stays in `general-settings.tsx`.

## Explicit non-goals (v1)

- Expand application menu (Settings…, Open Project, Window menu) — next phase  
- Close-to-tray as a separate setting (tied to tray on/off only)  
- Tray recent sessions / module shortcuts  
- Per-category notification toggles  
- Compile / experiment notifications  

## Acceptance

1. Toggle desktop notifications off → no OS toasts when agent finishes in background  
2. Toggle on + unfocused → toast on turn complete and on permission ask  
3. Tray on + close window → app stays alive; tray Show restores window; chat session still live  
4. Tray Quit → process exits cleanly  
5. Tray off + close → app quits (existing cleanup)  
6. Busy / needs-attention reflected in tray tooltip or icon while hidden  
7. en / zh-CN / zh-HK copy updated for both toggles  
