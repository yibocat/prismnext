// ─── Design Tokens ───
// All spacing, sizing, and visual parameters for the app.
// Import and use these instead of hardcoding Tailwind classes.

// -- Sidebar items (sessions, file tree) --
export const sidebarItem = {
  container: "flex flex-1 flex-col overflow-y-auto px-2 py-1 gap-1",
  item: "w-full justify-start h-auto py-1.5 my-px",
  itemActive: "bg-accent text-accent-foreground hover:bg-accent/90",
  itemIdle: "",
  font: "text-[12px]",
  rounded: "rounded-md",
} as const;

// -- Sidebar header --
export const sidebarHeader = {
  container: "flex h-8 shrink-0 items-center justify-between border-b border-border px-3",
  title: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
} as const;

// -- Toolbar buttons (Right Area, TitleBar) --
export const toolbarBtn = {
  base: "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0",
} as const;

// -- Dropdown trigger --
export const dropdownTrigger = {
  base: "flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
} as const;
