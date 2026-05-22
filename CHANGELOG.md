# Changelog

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
