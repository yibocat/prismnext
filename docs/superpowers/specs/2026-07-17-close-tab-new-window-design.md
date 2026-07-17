# Cmd+W cascade & Cmd+N new window — design

Date: 2026-07-17

## Cmd+W

1. RightArea expanded + tabs → close current RightArea tab; last tab gone → collapse RightArea.
2. RightArea collapsed (ignore stored RightArea tabs):
   - Multiple chat tabs → close current (skip streaming active; may close another closable).
   - Sole tab, disposable empty New Chat → close window.
   - Sole tab with content/draft/session → create fresh tab, then close the old one.
   - Sole streaming tab → close window (unchanged escape hatch).

Blank = `isDisposableEmptyChatTab` (no session, messages, stream, or draft).

## Cmd+N

Open an additional app window. Global ACP / bridges dispose only when the last window closes.
