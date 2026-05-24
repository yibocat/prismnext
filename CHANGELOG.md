# Changelog

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
