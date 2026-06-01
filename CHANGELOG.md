# Changelog

## 0.3.5 — 2026-06-02

### Right Panel — Tab State Persistence (Keep-Alive)

- **RightPane CSS keep-alive**: all open tabs' viewer components stay mounted in the DOM; inactive tabs are hidden via `position: absolute + visibility: hidden` instead of being unmounted — switching tabs now preserves cursor position, scroll position, undo history, PDF page number, side panel state, and all other internal viewer state without loss
- **TabContext system** (`lib/tab-context.ts`): new React Context injected by `PaneContent` that provides each viewer with its OWN tab's `fileId`, `filePath`, `kind`, and `isActive` — replacing the previous pattern where every viewer read the global `activeTab` from the Zustand store, which caused all mounted (hidden) editors to fight over the same file
- **PaneContent refactored**: `resolveViewer` now returns JSX elements directly instead of `React.ComponentType` to avoid `React.createElement` import issues; every viewer is wrapped in `<TabContext.Provider>` for data isolation
- **Editor focus management**: `LatexEditor` and `CodeEditor` now watch `isActive` from TabContext — active tab's editor auto-focuses, inactive tab's editor auto-blurs, preventing hidden editors from capturing keyboard events
- **RightMainArea reverted to conditional rendering**: the compiled-PDF panel in texworkspace mode does NOT use CSS keep-alive because Lector's virtualizer breaks when the panel container is resized to 0px; instead, page position is persisted and restored on remount
- **Fix RightPane overflow**: tab wrapper was missing `flex flex-col`, causing inner `flex-1 min-h-0` content to overflow its container and make the entire RightArea scrollable

### Cross-Session Position Persistence

- **New `lib/viewer-position.ts`**: lightweight localStorage persistence for scroll/page/cursor positions keyed by absolute file path — survives app restart
- **PDF page persistence**: `PdfPreview` saves current page every 3s via ref-based interval (avoids interval recreation on page change) and immediately on unmount; restores page on PDF load via `jumpToPage` from saved position
- **Editor position persistence**: `LatexEditor` and `CodeEditor` save cursor position and scroll position every 3s and on editor destruction; restored on mount with `scrollIntoView` after a `requestAnimationFrame` for correct layout
- **Position save skipped during merge view**: `isMergeActiveRef` check prevents saving spurious cursor/scroll values while the merge diff is active

### Text Selection Policy

- **Global `select-none`** on App root div — all UI chrome (sidebars, toolbars, tabs, buttons) no longer allows text selection, giving the app a more native desktop feel
- **`select-text` on PDF pages** (`Pages` component) — PDF text selection remains fully functional
- **`select-text` on chat area** (`LeftMainArea`) — AI responses and thinking blocks remain selectable for copy

### Viewer Data Isolation

- `MarkdownPreview` and `ImageViewer` migrated from reading global `activeTab.fileId` to using `useTabContext()` — each viewer now renders the correct file regardless of which tab is globally active

## 0.3.4 — 2026-05-31

### AiBar — Floating Chat Bar Rewrite

- **Relocated**: `AiBar` moved from `modules/shared/` to `modules/chat/` — it's now a core chat component rendered in RightArea when editor is maximized
- **Three-phase state machine** (`idle` → `input` → `expanded`): idle shows a thin 1.5px pill that expands on hover ("Manage AI Assistants ⌘I"); clicking opens a capsule input bar (single-line with + menu, text input, and send button); multi-line content auto-expands to full `ChatComposer` with seamless text handoff via native DOM setter
- **Chat panel overlay**: clicking "Done" / "Running" opens a conversation panel (`min(60vh, 600px)`) above the input area showing `ChatMessages` — panel opens with `animate-in fade-in slide-in-from-bottom-2` and closes with `animate-out fade-out slide-out-to-bottom-2` (150ms)
- **Click-outside to close**: panel auto-closes when clicking anywhere outside the panel, capsule, expanded composer, or Radix dropdowns
- **Context-aware toolbar**: Done/Running button only appears when there's a conversation (`messages.length > 0 || isStreaming`); Running state shows a pulsing dot indicator; Worktree selector always visible (Git functionality, not conversation-scoped)
- **Width alignment**: container hierarchy restructured to `max-w-3xl` outer → `px-3` inner, ensuring the capsule border, chat panel, and expanded ChatComposer all share identical visual width (`min(container, 48rem) - 24px`)

### Markdown Rendering — react-markdown → streamdown

- **Replaced `react-markdown`** with `streamdown` v2.5.0 — unified streaming-aware markdown renderer with built-in plugin system
- **New plugins**: `@streamdown/cjk` (CJK-friendly text handling), `@streamdown/code` (syntax-highlighted code blocks via Shiki), `@streamdown/math` (LaTeX math rendering with KaTeX), `@streamdown/mermaid` (Mermaid diagram support)
- **Removed dependencies**: `react-markdown`, `rehype-raw`, `rehype-sanitize`, `remark-gfm` — all functionality now handled by streamdown ecosystem

### Performance — Resize Smoothness

- **CSS transitions narrowed**: capsule, toolbar, and idle label in AiBar changed from `transition-all` (which animated `width` during window resize, causing ghosting) to targeted property transitions — `transition-[height,max-width,padding,background-color,border-color]` for capsule, `transition-[height,opacity,transform,margin]` for toolbar
- **CSS containment**: `[contain:layout_style]` added to LeftMainArea, RightArea, and both center panel wrappers in App.tsx — tells the browser these subtrees' layouts are independent, preventing cascading layout recalculations during window resize
- **`React.memo` on RightArea**: RightArea receives only 3 refs as props (never change); wrapping with `memo` prevents cascading re-renders from App.tsx Zustand subscriptions during resize
- **`React.memo` on ChatMessages**: prevents unnecessary re-renders from parent (AiBar phase transitions, panel open/close)

### Session Loading — Async I/O

- **`loadSessionHistory`**: `readFileSync` → `await readFile` from `fs/promises` — no longer blocks the Electron main process during session load
- **`listClaudeSessions`**: `readdirSync` + `statSync` + per-file `readFileSync` → `await readdir` + `await stat` + `await readFile` — eliminated the per-session synchronous file reads that blocked the UI when listing sessions with large histories
- **Immediate tab switch**: `loadSession` now sets `activeTabId` in the first `set()` call (before the IPC round-trip), giving users instant visual feedback when clicking a session — the new tab appears immediately, messages populate asynchronously

### ChatComposer — Background & Focus

- **Background fix**: `bg-muted/30` (30% transparent) → `bg-card` (solid) — fixes transparent background showing through in AiBar's floating expanded view
- **Focus state cleaned**: removed `focus-within:bg-background` — the card-to-background color shift on focus looked awkward; border ring color change alone sufficiently indicates focus

### ChatMessages — Empty State

- Simplified from large icon + "Start a conversation" heading + descriptive paragraph to a single muted line: "No messages yet — start a conversation below"
- Removed unused `MessageSquareIcon` import

### LeftSidebar — Padding Cleanup

- Removed `pt-1.5` (6px) from the fixed function buttons container — buttons now sit flush below the titlebar
- Removed `pt-1.5` (6px) from the ProjectSwitcher wrapper — eliminates doubled top padding
- Spacing between Done/Running button and Worktree selector moved from Worktree's `ml-1` to Done button's `mr-1` — spacing naturally disappears when Done button is hidden (New Agent state)

### Spacing Consistency

- Toolbar-to-input gap unified with panel-to-input gap: both now use `mb-2` (8px), previously toolbar used `mb-1` (4px)

### Dependencies

- Added: `streamdown@^2.5.0`, `@streamdown/cjk@^1.0.3`, `@streamdown/code@^1.1.1`, `@streamdown/math@^1.0.2`, `@streamdown/mermaid@^1.0.2`
- Removed: `react-markdown@^10.1.0`, `rehype-raw@^7.0.0`, `rehype-sanitize@^6.0.0`, `remark-gfm@^4.0.1`

### New Utilities

- **`debounced-storage.ts`**: debounced storage writes for frequently-updated state

## 0.3.3 — 2026-05-30

### Performance — Streaming Render Architecture Overhaul

- **Eliminated double-render**: removed `tick()` forced re-render in `use-cli-events.ts` — Zustand selectors already trigger reactivity; extra `useState` tick caused every stream delta to render the entire component tree twice
- **Split streaming message from committed messages**: `TabState` now has `streamingMessage` (mutable, per-delta) separate from `messages` (immutable, append-only); during streaming, `_upsertLastMessage` operates on `streamingMessage` in O(1) instead of copying the full messages array (O(n)); committed message references stay stable, preventing memo'd historical components from re-rendering
- **Incremental useMemo computations**: `toolResultMap`, `metaMap`, `inlinedResults`, and committed display filtering now depend only on `messages` (committed), not on the streaming-dependent `allMessages`; O(n) scans only run on message commit, not on every character delta
- **Granular projected field updates**: `_setStreaming`, `_setSessionId`, `_setError` only update their specific projected field instead of calling `projectActiveTab` to rebuild all fields — eliminates spurious selector re-renders on unrelated state changes

### Tool Widgets — Decoupled Architecture

- **Extracted `tools/` directory**: `tool-widgets.tsx` (528 lines, 9 components) split into 8 focused files — `edit-widget.tsx`, `bash-widget.tsx`, `todo-widget.tsx`, `thinking-widget.tsx`, `ask-question-widget.tsx`, `generic-widget.tsx`, `shared.tsx` (StatusIcon + DiffLines), `index.tsx` (ToolWidget router); each file 30–140 lines, single responsibility
- **All widgets memo'd**: each extracted widget wrapped in `React.memo` for render stability

### Thinking Widget — Correct Timer Isolation

- **Message-level streaming detection**: `ThinkingWidget` now accepts `isStreamingMsg` prop (passed from `ChatMessages` → `AssistantMessage`) instead of subscribing to global `useChatStore(s => s.isStreaming)`; fixes bug where all completed thinking blocks restarted their timers when a new interaction began
- **Thinking timer stops when thinking completes**: `AssistantMessage` detects `thinkingComplete` (text/tool_use blocks present) and sets `isStreamingMsg` to false; thinking elapsed time freezes at actual thinking duration, not total response time
- **Elapsed display with 1 decimal place**: timer updates every 100ms; `displayDuration` uses frozen `elapsed` (not text-length estimate) when timer stops; formatted as `"Thought for 12.3s"`

### Streaming Indicator — Simplified

- **Removed timer**: `StreamingIndicator` no longer shows elapsed seconds — just three bouncing dots + "Thinking..." text; represents CLI startup / waiting-for-first-token, not AI thinking time
- **10-character thinking threshold**: `showStreamingIndicator` requires ≥10 chars of thinking content before hiding, preventing 1–2 char delta flicker during the transition to `ThinkingWidget`

## 0.3.2 — 2026-05-30

### Streaming — Per-Token Real-Time Output

- **Added `--include-partial-messages` to Claude CLI args** — enables Anthropic API delta events wrapped in `stream_event` NDJSON envelopes, enabling true token-by-token streaming
- **Rewrote `ClaudeParser`** — unwraps `stream_event` envelopes, accumulates `content_block_delta` events, and emits progressive `assistant` messages after each delta; also handles direct `assistant`/`user`/`result` messages and top-level delta events defensively
- **Persistent process architecture** — switched from one-shot `-p` mode (each prompt spawned a new process, paying ~2s startup cost every time) to stdin/stdout long-lived process using `--input-format stream-json`; subsequent messages now skip the entire startup overhead
- **Prewarm support** — `cli-manager.ts` eagerly starts the Claude process on app launch via `ensureProcess()`; `cli:prewarm` IPC handler wires it through; first message latency significantly reduced
- Added `--dangerously-skip-permissions` to skip permission checks and `CLAUDE_CODE_EFFORT_LEVEL=low` env var for faster responses
- Parser emits empty-block guard: blocks with no text/thinking/input are suppressed, preventing the StreamingIndicator from being hidden before real content arrives

### Chat UX — Meta Display, Streaming Indicator, Composer

- **Completion time + token display**: completion time now formatted in seconds (`4.6s` instead of `4604ms`), displayed left of copy button; token usage (`↑23.6k ↓64`) pushed to the right via `ml-auto` with `·` separator; all computed from `displayMessages` at render time via `metaMap` — survives tab switches, view switches, and session reloads
- **`loadSession` no longer discards result messages** — `msg.type === "result"` was filtered out, dropping `duration_ms` and `usage` needed for meta display; now only `system` messages are filtered
- **`loadSession` always creates a new tab** — previously overwrote the current tab's messages (and sessionId), destroying in-memory meta for the original session; now each loaded session gets its own tab
- **StreamingIndicator timing fix**: indicator now stays visible until `hasThinkingContent` is true (thinking text > 0 characters), eliminating the "flash → blank ~1s → content" gap caused by empty initial deltas; reset moved from `useEffect` to render-phase via `prevStreamingRef` pattern to avoid React 18 batching race
- **Textarea height restored**: `rows={1}` → `rows={2}`, `min-h-10` → `min-h-12` (40→48px); toolbar spacing tightened (`gap-1.5`→`gap-1`, `pb-2`→`pb-1.5`)
- **Homepage toolbar spacing**: removed `pb-1` from toolbar, reduced composer top padding from `p-3` to `pt-2`
- **Removed `-my-2` and `[&_textarea]:min-h-14`** from composer wrapper (left-main-area.tsx) — negative margins caused page-level scroll overflow
- **Removed `shrink-0`** from ChatComposer root div — allows natural flex shrinking

### Sidebar — Performance Fix

- **Stopped subscribing to entire `tabs` array** in `LeftSidebar` — every stream delta triggered a store update, recreating the tabs array and re-rendering the entire sidebar hundreds of times per second; now only uses `sessionId + isStreaming` for the active-session streaming spinner
- **Wrapped `LeftSidebar` in `React.memo`** — prevents re-renders from parent component updates
- **Fixed `cli:sessionCreated` flooding**: removed the `!this.tabSessionIds.has(tabId)` guard during persistent-process rewrite, causing the event (and subsequent `fetchSessions()` call) to fire on every stream message; guard restored

### Architecture — CLI Coordination Layer

- **Deleted old ACP layer**: `agent-manager.ts` (394 lines), `agent.ts` (IPC, 200 lines), `use-agent-events.ts` (425 lines)
- **Added CLI coordination layer**: `cli-manager.ts` (persistent process lifecycle, stdin/stdout management, 235 lines), `cli.ts` (IPC handlers, 165 lines), `use-cli-events.ts` (stream → store bridge, 267 lines), `claude-parser.ts` (NDJSON parser with delta accumulation, 210 lines)
- **IPC channels renamed**: `agent:*` → `cli:*` across preload, IPC handlers, and type declarations; added `cli:answer` handler (was missing, caused silent failures for AskUserQuestion widget)
- **`ChatStreamMessage` type** remains the universal message format — any agent parser emits this shape; store, components, and IPC are agent-agnostic
- **`configs.ts`**: removed ACP references from OpenCode (`opencode acp --stdio`), Gemini (`--acp --stdio`), and Qoder (`acp --stdio`) — replaced with minimal placeholder args; added comprehensive integration guide (6 files to touch, CliParser interface requirements, CLI compatibility criteria)
- **`agent-config.ts`**: added cross-reference to main configs.ts integration guide
- **`chat-store.ts`**: added `messageMeta` per-tab map for completion/token metadata; `_upsertLastMessage` merges progressive assistant updates; `_appendMessage` atomically attaches meta when appending result messages; `messageMeta` survives message object replacement
- **`chat-messages.tsx`**: extracted `metaMap` computed from `displayMessages` consecutive `assistant → result` pairs; `inlinedResults` set for deduplication; `hasThinkingContent` for StreamingIndicator timing
- Store initialized with `messageMeta: {}` on `makeDefaultTab` and projected via `projectActiveTab`

### Fixes

- `cli-manager.ts` missing `tabSessionIds` field initialization → crash on first stream message (`Cannot read properties of undefined (reading 'has')`)
- `cli:answer` IPC handler was entirely missing — AskUserQuestion widget answers were silently dropped
- `LeftSidebar` `React.memo` wrapper requires `import { memo }` and closing `});`

## 0.3.1 — 2026-05-29

### Architecture: Remove assistant-ui, Inline Chat System

- **`@assistant-ui/react` dependency removed** — eliminates the entire assistant-ui runtime layer (v0.14.5), reducing bundle size and removing a third-party abstraction between the app and ACP streaming
- **Chat drawer system deleted**: `ClaudeChatDrawer`, `ClaudeRuntimeProvider`, `AssistantMessage`, `UserMessage`, `SessionSelector`, `ChatTabBar` — all assistant-ui-coupled components removed (~800 lines)
- Chat is now fully inline in LeftMainArea: homepage view (composer centered) and conversation view (messages + composer at bottom) — no more overlay/drawer/expanded state machine
- **`drawerState` removed** from `claude-chat-store` (the `closed | open | expanded` tri-state) — chat visibility is now implicit based on active tab and message history
- **`convertMessages` + `convertBlock` deleted** — the ~200-line message conversion pipeline (ClaudeStreamMessage → ThreadMessageLike via assistant-ui types) is no longer needed
- `AgentSettingsBar` replaces assistant-ui Primitive-based message parts rendering for agent config display

### Agent Settings System — Per-Agent Configuration Schema

- **New `AgentSetting` type system** in `configs.ts` (main process): `AgentSettingOption`, `AgentSettingType` (`"model" | "select" | "effort"`), and `AgentSetting` interfaces
- **Each agent now declares its own settings schema** via `AgentConfig.settings[]`:
  - Claude Code: Model (sonnet/opus/haiku), Mode (edit-before-ask/auto-edit/plan), Effort (low/medium/high)
  - OpenCode: Model (gpt-4o/gpt-4-turbo), Reasoning (low/medium/high)
  - Gemini CLI: Model (gemini-2.5-pro/gemini-2.5-flash), Style (precise/balanced/creative)
  - Qoder CLI: Model (llama-4/mixtral)
- **Settings flow through ACP pipeline**: `agentMode` and `effortLevel` are now passed from renderer → IPC (`agent:send`) → agent manager (`sendPrompt`) → stored in tab session settings for future ACP session configuration
- **New `agent-config.ts`** (renderer lib, 135 lines): mirrors main-process agent configs for renderer use (`AGENT_UI_CONFIGS`), decoupling UI from main-process imports

### AgentSettingsBar — Unified Settings Dropdown

- **New `AgentSettingsBar` component**: replaces the old Portal-based inline model picker in `ChatComposer`
- Single dropdown showing all active settings: e.g., "Sonnet · Edit before ask · L"
- **Three setting types supported**: `model` (dropdown with name + description), `select` (simple dropdown), `effort` (L/M/H segmented button)
- Model picker, agent mode selector, and effort level controls extracted from `ChatComposer` and consolidated into this reusable component
- Rendered inside `ChatComposer` bottom bar alongside the new "+" context menu

### AiBar — Floating AI Input Bar

- **New `AiBar` component** (158 lines): macOS Spotlight-style floating pill at the bottom of the editor area
- **Three-phase state machine**: `idle` (thin 1.5px-high pill, expands on hover), `input` (single-line input field with send button), `expanded` (full `ChatComposer` for multi-line input)
- **Seamless text handoff**: text typed in the input phase is injected into the expanded ChatComposer's textarea via native DOM setter + input event dispatch, preserving cursor position
- **Auto-expand on overflow**: single-line input automatically expands to full composer when text overflows the input width
- **Keyboard shortcut hint**: idle pill shows "Manage AI Assistants ⌘I" on hover
- Appears in RightMainArea when editor is maximized — replaces the old `AiFab` floating button placement
- `AiFab` retained in codebase but removed from `RightMainArea` render paths

### Preview → Texworkspace Rename

- **Systematic rename across 20+ files**: `preview` → `texworkspace` for tab kind, store state, components, and directory
- `preview-mode/` directory → `texworkspace-mode/`; `PreviewToolbar` → `TexworkspaceToolbar`; `previewViewMode` → `texworkspaceViewMode`
- `RightTabKind`: `"preview"` → `"texworkspace"`; `RightToolbarTab`: `"preview"` → `"texworkspace"`; `PreviewViewMode` → `TexworkspaceViewMode`
- Store methods renamed: `openPreviewFile` → `openTexworkspaceFile`, `switchToPreview` → `switchToTexworkspace`
- All layout, sidebar, right-panel, editor, and toolbar references updated consistently

### Right Sidebar — Architecture Rewrite

- **Removed `react-resizable-panels` Group/Panel/Separator** from right sidebar inner layout — replaced with custom flex layout (`flex-1` main + `shrink-0` sidebar) plus custom `SidebarDragHandle`
- **New `SidebarDragHandle` component**: custom mouse-drag handler (mousedown/mousemove/mouseup on document), reverse-direction drag (dragging right shrinks sidebar), wider hit area (`-left-1 -right-1`) for easier grabbing
- **`ResizeObserver` on sidebar DOM element**: syncs actual rendered width back to store, handles squeeze-by-container scenarios where the user isn't actively dragging
- **Collapse threshold 30px**: width saved only above 30px (preserves last real width); sidebar auto-closes when width drops below 30px — same pattern as App.tsx Panel onResize
- **`sidebarFullMode`**: when toggled open in narrow space (container width < sidebarWidth + 150), sidebar fills the entire RightArea (overlay-style), decided at toggle time
- **`toggleRightSidebar` → `setRightSidebarOpen` + custom `handleToggleSidebar`**: narrow check at open-time determines full mode; closing always clears full mode
- **Width constraints updated**: `SIDEBAR_RIGHT_MIN` 100 → 190, `SIDEBAR_RIGHT_MAX` 380 → 420; RightArea dynamic minimum = 150 + 190 = 340 when sidebar is open

### Accessibility — Nested Button Fix

- **`<button>` → `<span role="button" tabIndex={0}>`** in LeftSidebar session action items (archive, restore, delete) — these were nested inside shadcn `SidebarMenuButton` (which renders as `<button>`), creating invalid HTML
- **Keyboard handlers added**: `onKeyDown` listeners for Enter/Space on all session action spans, matching the click behavior (archive, restore, delete, pin)

### Chat Composer Refinements

- **"+" context menu added**: new dropdown (Select file, Upload image, Add link placeholder, Add code snippet placeholder) in composer bottom-left
- **Slash command handling simplified**: any `/`-prefixed input triggers the first matching slash command on Enter
- Model label display, effort toggle buttons, and Portal-based model picker removed from composer — all consolidated into `AgentSettingsBar`

### Store Cleanup

- **`aiModel` and `effortLevel` removed** from global `AppSettings` in `settings-store` — these are now per-agent settings managed in `claude-chat-store`
- **`drawerState` removed** from `claude-chat-store` — chat drawer state machine eliminated
- `claude-chat-store` `sendPrompt` now passes `agentMode` and `effortLevel` to the `agent:send` IPC call

### Constants Update

- `SIDEBAR_RIGHT_MIN` 100 → 190, `SIDEBAR_RIGHT_MAX` 380 → 420 for better right sidebar usability
- New `SIDEBAR_RIGHT_MIN` import in `App.tsx` for dynamic RightArea minimum calculation

## 0.3.0 — 2026-05-28

### Architecture: TitleBar Removal, Per-Panel Toolbars
- **TitleBar removed** from top-level layout; replaced by `ContentTopBar` inside the center panel and `SidebarControls` inside LeftSidebar / RightArea toolbars
- Each panel now owns its own drag-region toolbar, eliminating the shared-titlebar architectural constraint
- `SidebarControls` extracted as reusable component (sidebar toggle + command palette trigger), rendered in LeftSidebar when expanded, in ContentTopBar or RightArea toolbar when collapsed
- **`-ml-[1px]` position compensation**: SidebarControls button shifts left by 1px when rendered in ContentTopBar or RightArea to cancel the separator width crossed during container transition, ensuring identical absolute position in all states
- New components: `ContentTopBar`, `SidebarControls`, `CommandPalette` (Cmd+K), `ProjectSwitcher`, `SidebarToolbar`, `MainToolbar`, `TabToolbar`, `Kbd`

### Layout: 1px Jitter Elimination
- **`sidebarFullyCollapsed` state** (flips at 0px, not 30px) decouples toolbar layout-switch timing from the `sidebarExpanded` 30px threshold — toolbar button position only changes when the panel is genuinely at zero, not mid-animation
- **Separator `w-0` removed**: left sidebar separator is always `w-px` and always visible, eliminating the drag handle that disappeared during collapse (preventing drag-back) and the 1px layout shift during collapse/expand
- **`contain:layout` removed** from `[data-panel]` CSS — forces panels into independent formatting contexts, causing sub-pixel misalignment at panel boundaries (documented in `layout.css` comment)
- **`translateZ(0)` GPU hacks removed** from ContentTopBar and RightArea toolbar — same sub-pixel jitter mechanism as `contain:layout`
- **`sidebarWidth` clamped to `SIDEBAR_LEFT_MAX`** on save and restore, preventing oversized panel restoration after project switch
- **`overflow-hidden` on sidebar panel** prevents clipped SidebarControls from flickering during collapse animation
- Sidebar `minSize` increased 160→190 for better minimum usability

### Layout: Sidebar Overlay Fix
- **Safety net added**: on wide windows (>500px), `leftSidebarOverlay` is always cleared — prevents fullscreen portal overlay from persisting after project switch or window resize
- **Explicit `setLeftSidebarOverlay(false)` on expand** — overlay was never cleared in the expand code path, causing the sidebar to render as a full-screen portal even after expanding

### Right Sidebar: Constraint Fix
- Right sidebar inner panel `maxSize` 40%→80% — at narrow RightArea widths (250px), 40% = 100px < minSize (180px), creating an impossible constraint that froze the panel
- `SIDEBAR_RIGHT_MIN` 180→100 — combined minimum (right-main 150 + separator 1 + sidebar 100 = 251) fits within `RIGHT_AREA_MIN` (250)
- `RIGHT_AREA_MIN` 350→250 for better narrow-window behavior

### UI/UX: Centering & Spacing
- **BottomBar hidden** (`display: none`) — preserved in codebase for future re-enablement
- Homepage vertical centering compensated: `@xl:pb-[var(--height-titlebar)]` adds phantom bottom space equal to ContentTopBar height, re-centering the welcome dialog
- Chat Messages empty state compensated: `pb-[calc(2rem+var(--height-status-bar))]` offsets missing BottomBar height
- Homepage and chat view bottom spacing unified — `gap-1` removed from homepage, `pb-2` added to mode selector — composer now sits at identical position regardless of empty/active state

### Session Management
- **Session pinning**: pin/unpin sessions to top of list with dedicated Pinned section
- **Session archiving**: archive/restore/delete sessions with toggle between active and archived views
- **Session sorting**: sort by last updated or date created
- Session list fetches on project open, stream completion, and new session creation events

### Chat Composer
- Composer layout refined: toolbar bar moved above textarea, send button relocated to bottom-right
- Agent selector and mode selector extracted from TitleBar into homepage/chat-view inline dropdowns

## 0.2.10 — 2026-05-26

### Layout System — Critical Bug Fixes
- **RightArea overlap fix**: removed `groupResizeBehavior="preserve-pixel-size"` from rightArea Panel that caused rightArea to resist shrinking and visually overlap the center AI Chat panel when dragging LeftSidebar wider
- **Minimize/Restore fix**: save rightArea width in maximize button onClick *before* calling `c.collapse()`, preventing the stored width from being polluted by the post-collapse redistributed full-width value; restore button uses `c.expand()` + `r.resize(store.rightAreaWidth)` for deterministic recovery
- **Separator unlocked**: removed `disabled={editorMaximized}` from center-rightArea separator, allowing users to drag back from maximized state instead of being trapped
- **RightArea initial state fix**: `defaultSize` changed from persisted width to `0`, preventing constraint violations on layout remount in narrow windows that caused rightArea to show instead of AI Chat after project switch
- **LeftSidebar narrow-window fix**: `useEffect` → `useLayoutEffect` for overlay threshold check so collapse runs before paint; `expand()` replaced with `resize(persistedWidth)` for reliable restore; conditional `defaultSize` returns `0` below 500px window width to prevent sidebar rendering inline on project switch in narrow windows

### ACP Agent
- Session resume support: agent manager accepts optional `sessionIdToResume` parameter for restoring previous sessions
- Path traversal security: `readTextFile` validates that resolved paths stay within project directory
- Throttled stderr forwarding to renderer (max 1 event per second)
- Close tab now cancels running prompt and kills agent session process

### AI Chat
- Expanded tool widgets with structured outputs (Write, Edit, MultiEdit, Bash, TodoWrite, NotebookEdit, etc.)
- Thinking duration cached and displayed for loaded sessions
- Tab bar drag-and-drop reorder, improved close-tab index calculation
- System prompt cleaner utility strips metadata blocks before display
- Runtime provider simplified with ref-based streaming guard

### Editor
- New changes-bar component showing proposed diffs (accept/reject per file or all)
- Editor toolbar enhanced with compile, PDF toggle, and changes controls
- Changes store tracks last-active and auto-clears on project switch

### Chat Tab Bar
- Drag-and-drop tab reorder with `onReorder` callback
- Improved overflow scrolling and active-tab auto-scroll-into-view
- Empty-state hidden when no tabs exist

## 0.2.9 — 2026-05-26

### Settings Page
- Unified Settings page accessible from titlebar gear button and Welcome Page
- Left sidebar switches between Sessions and Settings navigation
- App-level settings: General (placeholder), Appearance, Shortcuts (placeholder)
- Project-level settings: Compiler, AI & APIs (visible only when project is open)
- Theme setting now syncs to both next-themes and electron-store
- Zotero API Key / User ID with encrypted persistence
- Compiler engine and auto-compile controls

### New Project Dialog
- Replace inline welcome-page form with Shadcn Dialog
- Project name input + location picker in single dialog
- Shared between Welcome Page and titlebar project dropdown

### Welcome Page
- Skip option to enter app without opening a project ("Skip for now")
- Independent AI Chat works without a project (cwd falls back to home dir)
- Welcome Page settings access hides Project section
- Responsive two-column layout (stacks vertically on narrow)
- Layout tightened: balanced column widths, compact buttons

### Left Sidebar
- Narrow-window overlay mode: below 500px sidebar opens as fullscreen overlay via Portal
- Overlay auto-closes on item selection (session / settings category)
- Width auto-persists across restarts via Zustand persist middleware
- Width restores on window widen (crossing threshold)

### Right Sidebar
- Width auto-persists across restarts

### Right Area
- Width auto-persists across restarts
- Left sidebar toggle simplified: no more Panel collapse/expand race conditions

### AI Chat
- Independent chat mode: sessions stored in home directory when no project
- Session list and deletion work without project
- Fixed: closeProject now cleans up all sub-stores (agent, tabs, sessions, PDF cache)

### UI
- Remove focus rings from Button, Input, Toggle, Select, Textarea
- Welcome Page settings gear button
- Titlebar settings gear toggles settings/sessions

### Fixes
- Sidebar width persisted and restored correctly on restart
- `closeProject` clears agent sessions and right panel tabs
- `leftSidebarRef` mobile collapse fixed for no-project layout
- Focus rings removed globally from interactive elements

## 0.2.8 — 2026-05-25

### Preview Mode — Overleaf-Style Writing Workspace
- New Preview tab kind: dedicated LaTeX writing mode with left editor + right PDF split
- Three-view toggle: split / TeX only / PDF only (Shadcn ToggleGroup)
- Right file tree locked to Manuscript in Preview mode; header mode selector locked
- File selection in Preview mode updates Preview tab directly — no tab switching
- Compile completion auto-switches to Preview tab with the compiled file
- PreviewToolbar module: compile, auto-compile, compile log (Sheet), view toggle

### Tab-Driven Architecture
- Preview mode driven by `activeTab.kind === "preview"`, not global toolbar state
- Closing Preview tab exits Preview mode cleanly — no layout residual
- Tab kind syncs toolbar mode button highlighting
- Add `openPreviewFile` and `switchToPreview` store methods

### TabBar Component
- Extract TabBar to standalone component with drag-to-reorder and horizontal scroll
- Right-click context menu: Close / Close Others
- Drop zone indicators for drag insertion points

### Right Pane System
- Extract `RightPane` and `PaneContent` — tab kind → content resolution
- Viewer registry: `.tex` → LaTeX editor, `.pdf` → PDF viewer

### Improvements
- PDF viewer: single-page PDF vertically centered in viewport
- Toolbar: mode buttons and tools protected from shrinking; `overflow-x-auto` fallback
- Auto-compile icon matches bottom bar (ZapIcon / ZapOffIcon)

### Removed
- `pdfPreviewOpen` boolean — replaced by tab-driven Preview mode
- Dead `markUsed` code in right-panel-store

### Fixed
- TabBar tab hover cursor now shows default (was text I-beam)
- `compileFile` and document store `activeFile` sync cover both file and preview tab kinds

## 0.2.7 — 2026-05-25

### Mobile Responsive Layout
- Window narrows to <768px: sidebars auto-collapse, center fills screen
- Mobile RightArea open: auto-maximize (RightArea fills window)
- Mobile minimize/close: return to Center-only view
- shadcn Sidebar Sheet overlay replaces persistent sidebar on mobile
- Min window width 393px (iPhone 16)

### Pane System (Split View)
- Rewrite `right-panel-store`: flat tabs → `panes[].tabs[]` hierarchy
- Multi-pane rendering via `react-resizable-panels` Group with separators
- `splitPane(direction, tabId)` — creates new pane, moves tab
- `closePane(id)` — merges tabs into remaining pane
- `moveTab(paneId, fromIndex, toIndex)` — reorder within pane
- `RightPane` component: TabBar + Content per pane

### Tab Bar
- Extract TabBar to standalone component with horizontal scroll (`overflow-x-auto`)
- Remove toolbar-level TabBar — tabs live in each Pane

### Code Organization
- Extract placeholder components to module files:
  - `modules/editor/no-file-open.tsx`
  - `modules/git/git-placeholder.tsx`
  - `modules/browser/browser-placeholder.tsx`

### Fixes
- LeftSidebar collapse while maximized: RightArea fills freed space (avoids Center reappearing)
- RightSidebar drag-close then click: single click to reopen (onResize syncs `rightSidebarOpen`)
- Narrow-window close RightArea/Minimize: use `resize(9999)` instead of `expand()` (avoids stale memory)
- Center Panel `minSize` 200→300 (more comfortable minimum)
- Chat empty state moves to bottom on narrow Center panel (container query `@xl`)

## 0.2.6 — 2026-05-24

### Resizable Panel Architecture
- Migrate from custom resize handlers to `react-resizable-panels` v4 for smooth, native-feel panel resizing
- Nested Group layout: LeftSidebar in outer Group, Center + RightArea in inner Group within MainArea wrapper
- Panel API is the single source of truth; Zustand is a read-only mirror synced via `onResize` callbacks
- Buttons call only Panel API (`collapse`/`expand`/`resize`), never write to Zustand directly
- Remove `closeEditorTab` interfering with `editorMaximized` state

### Panel Configuration
- LeftSidebar: `preserve-pixel-size`, collapsible, 160–35% (default 240px)
- RightArea: `preserve-pixel-size`, collapsible, 350px min (default 650px), auto-collapses on mount
- Center: flexible (no preserve-pixel-size), collapsible, 200px min
- RightSidebar: `preserve-pixel-size`, collapsible, 180px–40% (default 220px)

### Maximize / Minimize
- Maximize: collapses Center, RightArea fills remaining space (respects LeftSidebar boundary)
- Minimize: restores Center and RightArea to previous side-by-side widths
- Collapsing LeftSidebar while maximized: RightArea auto-expands to fill freed space

### Separator Design
- 1px visible separator line (`bg-border`), hover changes to `primary/40`
- 5px hit area via `resizeTargetMinimumSize` for easy grabbing
- Removed shadcn Sidebar panel border lines that caused double-border artifacts

### Self-Protection
- Each panel auto-collapses when squeezed below its minimum width (prevents constraint violations on narrow windows)

### AI Fab
- Moved from individual tab renderers to RightMainArea outer level; appears on all tabs when maximized

## 0.2.5

### Theme System — Clean & Connect
- Clean dead scale variables from tokens.css: spacing, icon, radius, shadow scales (unused parallel system)
- Move height base scale to globals.css @theme with two-tier chain (base → component token → component)
- Replace z-index CSS variables with Tailwind z-10/z-20/z-50 directly
- Document design system architecture in globals.css: which scale lives where
- Add spacing base unit control point (--spacing: 0.25rem) and animation durations in @theme
- Remove duplicate --layout-resize-handle, remove unused CSS layout variables
- Add Z-Index layer documentation to all module token files

### Phase 4 Completion
- Heights: 15 component tokens derive from 5 base values, each independently overridable
- Typography: 30 font tokens across 6 module files, Tailwind text-xs/text-sm connected to base scale
- Layout: resize handle width centralized, sidebar/panel widths in constants.ts
- Z-Index: 4 documented layers (z-10/z-20/z-50/z-9999) with per-module component mapping

## 0.2.4

### Sidebar Rewrite
- Rewrite left sidebar (Sessions) with shadcn Sidebar components: SidebarMenu, SidebarMenuButton, SidebarMenuAction
- Rewrite right sidebar (Files/Git/Browser) with shadcn SidebarMenu + SidebarMenuSub for file tree nesting
- Separate right sidebar into scenario components: FilesSidebar, GitSidebar, BrowserSidebar
- Add "All" mode to file tree mode selector with separator
- Apply design token font sizes and heights throughout

### Bug Fixes
- Fix duplicate tab creation when clicking already-open files — now switches to existing tab
- Decouple editor content from file tree active state — clicking blank tree area no longer clears editor
- Fix file tree filter logic — mode directories no longer appear as empty tree nodes
- Fix other mode directories (vault, code, assets, etc.) after filter refactor

### UI Improvements
- Compact file tree items: smaller icons (12px), reduced padding (py-0.5, h-6), tighter gap (0.5)
- Remove vertical indent border on nested folders — full-width hover/active backgrounds
- Left sidebar delete button uses shadcn showOnHover pattern

### Architecture
- Four-layer component structure: ui/ (atoms) → modules/ → layout/ → app
- Add barrel exports (index.ts) per module for clean imports
- Move dead code to components/__archive/ (tsconfig excluded)

## 0.2.3

### Component Restructuring
- Reorganize components into four-layer architecture: ui (atoms) → modules → layout → app
- Move all feature modules under `components/modules/`: editor, preview, chat, project, shared
- Add barrel exports (`index.ts`) per module — external code imports from module boundary only
- Isolate dead code into `components/__archive/` (excluded from tsconfig):
  - Full CodeMirror editor with merge view (879 lines)
  - Workspace sidebar with file tree + TOC (821 lines)
  - Editor toolbar, search panel, tab bar, AI change panel

### Dead Code Removal
- Remove `workspace-layout.tsx` (zero imports)
- Remove `welcome/welcome-screen.tsx` (106 lines, duplicate, zero imports)
- Remove `workspace/preview/pdf-preview.tsx` (407 lines, duplicate, zero imports)
- Delete empty directories: `workspace/`, `welcome/`, `assistant-ui/`

## 0.2.2

### IPC Cleanup
- Remove legacy `ipc-claude.ts` — replaced by ACP-based `agent.ts`
- Strip `ipc-` prefix from IPC filenames: `ipc-agent.ts` → `agent.ts`, etc.
- Remove legacy Claude API from preload (`claude:status/send/cancel` etc.) and type declarations
- Remove legacy Claude events (`onClaudeStream/Complete/Stderr`, `removeClaudeListeners`)

## 0.2.1

### Design Token System
- Centralized three-tier token architecture: Base Scale → Module Token → Component
- `styles/tokens.css`: base scale for heights, fonts, spacing, icons, radius, shadow, z-index, animation
- `styles/tokens/layout.css`: TitleBar, Sidebars, BottomBar, RightArea tokens
- `styles/tokens/editor.css`: CodeMirror, tabs, file tree, search panel tokens
- `styles/tokens/preview.css`: PDF viewer, preview controls tokens
- `styles/tokens/chat.css`: messages, composer, sessions, tool widgets tokens
- `styles/tokens/project.css`: welcome page, dialogs tokens
- `styles/tokens/shared.css`: cross-module tokens (timestamp, kbd, path, error)
- `styles/constants.ts`: centralized behavioral parameters

### Heights
- 5 raw values replaced with 15 per-component tokens
- Each toolbar, header, and bar independently controllable from a single source

### Typography
- All hardcoded `text-[Npx]`/`text-xs`/`text-sm` replaced with 30 component-level font tokens
- 11 shadcn/ui components connected to font base scale
- Each UI element mapped to a specific token under `tokens/*.css`

### Layout
- Sidebar/panel default widths, resize handle centralized in `constants.ts`
- Moved `sidebarItem` preset inline, removed `design-tokens.ts` and `sidebar-presets.ts`

### Z-Index
- 29 scattered z-index values replaced with 4-layer stack: `z-base` | `z-above` | `z-overlay` | `z-top`
- Module-level documentation in each `tokens/*.css` showing which components use which layer

## 0.2.0

### Welcome Page
- Added global welcome page when no project is open
- New Project form: select location + name, auto-scaffolds project structure
- Recent Projects list with existence check (grayed out if missing, removable)
- Auto-restore last project on app launch
- Close project button in titlebar returns to welcome page
- Minimal titlebar on welcome page with theme toggle and settings

### Project Structure
- `.prismnext/` hidden directory for project metadata
- Scaffolded directories: `manuscript/`, `vault/`, `code/`, `assets/`, `zotero/`, `other/`
- Internal structure: `settings.json`, `state.json`, `.gitignore`, `sessions/`, `compile/`
- Project setup dialog (Shadcn) prompts to scaffold missing directories when opening non-project folders
- Compile output directed to `.prismnext/compile/`
- Settings saved per-project via electron-store

### AI Chat (Left Area)
- Removed ChatTabBar; session switching via Left Sidebar only
- Centered homepage with composer when no messages
- Agent/Model selector on homepage composer
- Agent mode selector: Edit before ask / Auto edit / Plan mode
- Project dropdown in homepage toolbar (shared with titlebar)
- Session list with delete; deleting current session navigates to recent or homepage
- System prompt and local-command messages filtered from chat display
- Thinking block deduplication at tool call boundaries
- Session ID synced from agent events for proper delete-navigate flow

### Right Area
- Unified toolbar: Files/Git/Browser icon tabs + inline file tabs
- Extensible tab system (`right-panel-store`): supports file, browser, git-overview, git-diff
- Initial tab concept: reuse empty tab before creating new ones
- "+" button dropdown: New File types + New Tab (Files/Git/Browser)
- Compile button, maximize, sidebar toggle in toolbar
- Mode switcher (Manuscript/Vault/Code/Assets/Other) in Files dropdown
- Viewer registry: extension → component mapping (`.tex` → editor, `.pdf` → PDF viewer)
- RightSidebar closes by default

### UI Polish
- Unified border-radius (`rounded`) across titlebar, toolbar, and dropdowns
- Right Area toolbar height matches titlebar (38px)
- Git branch indicator moved from titlebar to bottom bar
- Search bar replaced with ⌘K button on titlebar
- Titlebar layout: `[⌘K] [Theme] | [More] [RightArea]`
- Removed unused Right Area bottombar

### Fixes
- Local command messages filtered at JSONL load time
- Session titles no longer show system content
- `process.env` → `import.meta.env` for Vite renderer compatibility
- TypeScript compilation errors resolved
