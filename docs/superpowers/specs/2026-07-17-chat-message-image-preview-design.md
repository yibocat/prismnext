# Chat message image preview — design

Date: 2026-07-17

## Goal

AI reply images in chat should feel like content blocks (rounded frame) and support the same click-to-enlarge preview as user-attachment / composer thumbnails.

## Scope

- In: `ChatProjectImage` (markdown replies + experiment artifact galleries)
- Out: user attachment preview (already wired); editor extract markdown preview

## Behavior

1. **Inline** (`ChatProjectImage`): padded frame (`p-1.5`), `rounded-lg` border, muted plate, clickable
2. **Preview** (`ChatImagePreviewDialog`): near-fullscreen dialog; ± zoom (no wheel); drag to pan when zoomed; double-click toggle 1×/2×; Esc / overlay / high-contrast circular close
3. **Shared by**: chat markdown images, experiment artifact images, composer attachments, user-bubble attachment thumbs
4. **Not shared**: editor Markdown Preview uses `ExtractMarkdownImage` (separate path; no preview yet)

## Non-goals

- Wheel / trackpad zoom (easy to misfire while scrolling)
- Editor extract markdown preview parity (optional follow-up)
