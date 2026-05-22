# Changelog

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
