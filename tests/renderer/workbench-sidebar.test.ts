import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterRecentWorkbenchProjects,
  JOINABLE_RECENT_PREVIEW_COUNT,
  visibleJoinableRecentProjects,
} from "@/lib/workspace/project-lifecycle";
import {
  anyWorkbenchProjectExpanded,
  ensureWorkbenchProjectExpanded,
  groupSessionsByUpdatedAt,
  isWorkbenchProjectExpanded,
  sessionDateBucket,
  toggleWorkbenchProjectExpanded,
} from "@/stores/workbench-store";

const REPO = join(import.meta.dirname, "../..");

function sourceOf(rel: string): string {
  return readFileSync(join(REPO, rel), "utf-8");
}

describe("workbench folder expand", () => {
  it("opens only the focused project before the user toggles anything", () => {
    expect(isWorkbenchProjectExpanded("p_a", null, "p_a")).toBe(true);
    expect(isWorkbenchProjectExpanded("p_b", null, "p_a")).toBe(false);
  });

  it("keeps an explicit empty list collapsed, including the focused project", () => {
    expect(isWorkbenchProjectExpanded("p_a", [], "p_a")).toBe(false);
  });

  it("toggles from the default focus-only set without snapping back", () => {
    const collapsed = toggleWorkbenchProjectExpanded("p_a", null, "p_a");
    expect(collapsed).toEqual([]);
    expect(isWorkbenchProjectExpanded("p_a", collapsed, "p_a")).toBe(false);
    expect(toggleWorkbenchProjectExpanded("p_b", collapsed, "p_a")).toEqual(["p_b"]);
  });

  it("ensure adds a project without dropping others", () => {
    expect(ensureWorkbenchProjectExpanded("p_b", ["p_a"], "p_a")).toEqual(["p_a", "p_b"]);
    expect(ensureWorkbenchProjectExpanded("p_a", ["p_a"], "p_a")).toEqual(["p_a"]);
  });

  it("treats any open project as collapse-all, including the default focus-only set", () => {
    expect(anyWorkbenchProjectExpanded(["p_a", "p_b"], null, "p_a")).toBe(true);
    expect(anyWorkbenchProjectExpanded(["p_a", "p_b"], [], "p_a")).toBe(false);
    expect(anyWorkbenchProjectExpanded(["p_a", "p_b"], ["p_b"], "p_a")).toBe(true);
  });

  it("groups sessions into local date buckets newest-first", () => {
    const now = Date.parse("2026-08-23T15:00:00");
    expect(sessionDateBucket(now, now)).toBe("today");
    expect(sessionDateBucket(now - 26 * 60 * 60 * 1000, now)).toBe("yesterday");
    const grouped = groupSessionsByUpdatedAt(
      [
        { lastModified: now - 2 * 24 * 60 * 60 * 1000, id: "week" },
        { lastModified: now, id: "today" },
      ],
      now,
    );
    expect(grouped.map((g) => g.bucket)).toEqual(["today", "week"]);
    expect(grouped[0]?.sessions[0]?.id).toBe("today");
  });
});

describe("workbench add recents", () => {
  const recents = [
    { path: "/a/one", name: "one", lastOpened: 3 },
    { path: "/b/two", name: "two", lastOpened: 2 },
    { path: "/c/three", name: "three", lastOpened: 1 },
  ];

  it("keeps workbench members in recents and matches name or full path", () => {
    expect(filterRecentWorkbenchProjects(recents, ["/b/two/"], "")).toEqual([
      { ...recents[0], onWorkbench: false },
      { ...recents[1], onWorkbench: true },
      { ...recents[2], onWorkbench: false },
    ]);
    expect(filterRecentWorkbenchProjects(recents, [], "THREE")).toEqual([
      { ...recents[2], onWorkbench: false },
    ]);
    expect(filterRecentWorkbenchProjects(recents, ["/a/one"], "/a/one")).toEqual([
      { ...recents[0], onWorkbench: true },
    ]);
  });

  it("keeps remote recents out of the local add-panel list", () => {
    expect(filterRecentWorkbenchProjects(
      [
        ...recents,
        { path: "remote://lab/home/ubuntu/paper", name: "paper", lastOpened: 9 },
      ],
      [],
      "",
      { path: "remote://lab/home/ubuntu", name: "ubuntu" },
    ).map((item) => item.path)).toEqual(["/a/one", "/b/two", "/c/three"]);
  });

  it("always lists the default project in the add-panel recents", () => {
    const listed = filterRecentWorkbenchProjects(
      recents,
      ["/b/two/"],
      "",
      { path: "/docs/PrismNext", name: "PrismNext" },
    );
    expect(listed[0]).toEqual({
      path: "/docs/PrismNext",
      name: "PrismNext",
      lastOpened: Number.MAX_SAFE_INTEGER,
      onWorkbench: false,
      isDefault: true,
    });
    expect(listed).toHaveLength(4);
  });

  it("shows eight recents then More, and all matches while searching", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      path: `/p/${i}`,
      name: `p${i}`,
      lastOpened: i,
    }));
    const collapsed = visibleJoinableRecentProjects(many, { expanded: false });
    expect(collapsed.items).toHaveLength(JOINABLE_RECENT_PREVIEW_COUNT);
    expect(collapsed.remaining).toBe(4);
    expect(visibleJoinableRecentProjects(many, { expanded: true }).remaining).toBe(0);
  });
});

describe("workbench sidebar wiring", () => {
  it("puts Settings back above the category list, not in a footer", () => {
    const settings = sourceOf("src/renderer/components/modules/settings/settings-sidebar.tsx");
    const backAt = settings.indexOf('t("common.back")');
    const groupsAt = settings.indexOf("SETTINGS_GROUPS.map");
    expect(backAt).toBeGreaterThan(settings.indexOf("overflow-auto"));
    expect(backAt).toBeGreaterThan(-1);
    expect(groupsAt).toBeGreaterThan(-1);
    expect(backAt).toBeLessThan(groupsAt);
    expect(settings).not.toContain("SidebarFooter");
  });

  it("does not mount a current-project switcher", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    const settings = sourceOf("src/renderer/components/modules/settings/settings-sidebar.tsx");
    expect(sidebar).not.toContain("ProjectSwitcher");
    expect(settings).not.toContain("ProjectSwitcher");
    expect(sidebar).toContain("data-workbench-project");
    expect(sidebar).toContain("toggleProjectExpanded");
    expect(sidebar).not.toMatch(/onClick=\{\(\) => toggleProjectExpanded[\s\S]*focusProject/);
  });

  it("loads a session on row click and does not open a project when toggling a folder", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    expect(sidebar).toContain("loadSession(s.id, s.directory, s.projectLastPath)");
    expect(sidebar).toContain("toggleProjectExpanded(member.id)");
    expect(sidebar).not.toContain("openProject(");
  });

  it("paints project and session hovers as full-width LeftSidebar rows", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    const settings = sourceOf("src/renderer/components/modules/settings/settings-sidebar.tsx");
    const nav = sourceOf("src/renderer/components/layout/left-nav-button.tsx");
    expect(nav).toContain('text-muted-foreground');
    expect(nav).toContain("LEFT_SIDEBAR_FOOTER_ICON");
    expect(nav).toContain("LeftNavIconButton");
    expect(nav).toContain("LEFT_SIDEBAR_SECTION_LABEL");
    expect(nav).toContain("font-hint");
    expect(nav).toContain("font-session-item");
    expect(nav).toContain("LEFT_SIDEBAR_SECTION_ACTION");
    expect(nav).toContain('LEFT_SIDEBAR_SECTION_ACTION_ICON = "size-3"');
    expect(nav).toContain("hover:bg-sidebar-accent");
    expect(nav).toContain("data-[state=open]:bg-sidebar-accent");
    expect(sidebar).toContain("flex items-center gap-1");
    expect(sidebar).toContain("LEFT_SIDEBAR_SECTION_ACTION");
    expect(sidebar).toContain("LEFT_SIDEBAR_ROW");
    expect(sidebar).toContain("LEFT_SIDEBAR_ROW_ACTION");
    expect(sidebar).toContain("LEFT_SIDEBAR_STACK");
    expect(sidebar).toContain("LEFT_SIDEBAR_AFTER_EXPAND");
    expect(sidebar).toContain("LEFT_SIDEBAR_AFTER_COLLAPSE");
    expect(nav).toContain('LEFT_SIDEBAR_AFTER_EXPAND = "pt-2"');
    expect(nav).toContain('LEFT_SIDEBAR_AFTER_COLLAPSE = "pt-0.5"');
    expect(nav).toContain("WorkbenchFolderGlyph");
    expect(nav).toContain("FolderOpen");
    expect(settings).toContain("LEFT_SIDEBAR_STACK");
    expect(sidebar).toContain("group/project");
    expect(sidebar).toContain("data-workbench-session");
    expect(sidebar).not.toContain("LEFT_SIDEBAR_TREE_GUTTER");
    expect(sidebar).not.toContain("workbenchIndent");
    expect(sidebar).not.toMatch(/SidebarMenu className="pl-3"/);
  });

  it("lists pinned chats above Workbench and marks archived rows with an archive icon", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    expect(sidebar).toContain("togglePinnedExpanded");
    expect(sidebar).toContain("LeftSidebarReveal");
    expect(sidebar).toContain("nav.sessions.pinned");
    expect(sidebar).toContain("nav.sessions.filter");
    expect(sidebar).toContain("nav.sessions.archived");
    expect(sidebar).toContain("nav.sessions.grouping");
    expect(sidebar).toContain("nav.sessions.groupUpdated");
    expect(sidebar).toContain("nav.sessions.statusSoon");
    expect(sidebar).toContain("nav.sessions.expandAll");
    expect(sidebar).toContain("nav.sessions.collapseAll");
    expect(sidebar).toContain("showProject: true");
    expect(sidebar).toContain("SessionContextCard");
    expect(sidebar).toContain('side="right"');
    expect(sidebar).toContain("showProject && \"h-[1lh] w-4\"");
    expect(sidebar).toContain("project.id === defaultProjectId");
    expect(sidebar).toContain("DefaultProjectBadge");
    expect(sidebar).toContain("showProject ? sessionTrailing : null");
    expect(sidebar).toContain("LEFT_SIDEBAR_FOOTER_ICON");
    expect(sidebar).toContain("renderArchivedSessionItem");
    expect(sidebar).toContain("!showArchived && pinnedSessions");
    expect(sidebar).not.toContain("AppContextMenuSeparator");
    expect(sidebar).not.toContain("AppMenuSeparator");
    expect(sidebar).toContain("SessionStatusIndicator");
    expect(sidebar).toContain("pinSession(s.id)");
    expect(sidebar).not.toContain("absolute opacity-0 group-hover/session:opacity-100");
  });

  it("keeps only + on the project row and opens Edit / Archive all / Remove from the context menu", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    expect(sidebar).toContain("AppContextMenu");
    expect(sidebar).toContain("nav.project.editProject");
    expect(sidebar).toContain("nav.project.archiveAll");
    expect(sidebar).toContain("nav.project.removeFromWorkbench");
    expect(sidebar).toContain("archiveSessionsForProject");
    expect(sidebar).toContain("EditProjectDialog");
    expect(sidebar).toContain("newSessionInProject");
    expect(sidebar).not.toContain("AppContextMenuSeparator");
    expect(sidebar).not.toMatch(/\bMinus\b/);
    expect(sidebar).toContain("WorkbenchFolderGlyph");
    expect(sidebar).toContain("open={expanded}");
    expect(sidebar).not.toContain("WorkbenchProjectGlyph");
    expect(sidebar).toContain("reorderProjects");
    expect(sidebar).toContain("useVerticalListReorder");
    expect(sidebar).toContain("data-project-drag-ignore");
    expect(sidebar).toContain("DefaultProjectBadge");
    expect(sidebar).toContain("group/project cursor-pointer select-none");
    expect(sidebar).not.toMatch(/\bcursor-grab\b/);
    expect(sidebar).toContain("cursor-grabbing");
    expect(sidebar).toContain("window.setTimeout");
    expect(sidebar).not.toContain("canRemove");
    expect(sidebar).toContain("consumeSkipClick");
    expect(sidebar).not.toContain("skipClickRef");
    const reorder = sourceOf("src/renderer/lib/workspace/vertical-list-reorder.ts");
    expect(reorder).toContain("shouldSuppressClickAfterDrag");
  });

  it("keeps model picker rows one line unless AppMenu titleAddon is set", () => {
    const menu = sourceOf("src/renderer/components/ui/app-menu.tsx");
    expect(menu).toContain("function AppMenuTitleWithAddon");
    expect(menu).toContain("if (titleAddon)");
    expect(menu).toContain("<AppMenuItemLabel>{children}</AppMenuItemLabel>");
  });

  it("puts Settings and Archived as footer icons and lists archived chats in two lines", () => {
    const sidebar = sourceOf("src/renderer/components/layout/left-sidebar.tsx");
    const items = sourceOf("src/renderer/lib/workspace/left-nav/items.tsx");
    expect(items).toContain('shortcutId: "product.newChat"');
    expect(items).toContain('shortcutId: "shell.openSettings"');
    expect(items).not.toContain('trailing: <ShortcutKbdChips id="product.newChat" />');
    expect(items).not.toContain('trailing: <ShortcutKbdChips id="shell.openSettings" />');
    expect(sidebar).toContain("LeftNavIconButton");
    expect(sidebar).toContain("renderArchivedSessionItem");
    expect(sidebar).toContain("projectMetaForSession");
    expect(sidebar).toContain("nav.sessions.noArchived");
  });

  it("joins a folder from the add panel through lib, not the menu", () => {
    const menu = sourceOf("src/renderer/components/layout/workbench-add-menu.tsx");
    const lib = sourceOf("src/renderer/lib/workspace/project-lifecycle.ts");
    expect(menu).not.toMatch(/desktop-api/);
    expect(menu).toContain("filterRecentWorkbenchProjects");
    expect(menu).toContain("pickAndJoinWorkbenchFolder");
    expect(menu).toContain("openRecentFromAddPanel");
    expect(menu).toContain("nav.workbench.searchProjects");
    expect(menu).toContain("nav.workbench.recents");
    expect(menu).toContain("nav.workbench.more");
    expect(menu).toContain("nav.workbench.openFolder");
    expect(menu).toContain("nav.workbench.defaultBadge");
    expect(menu).toContain("titleAddon");
    expect(menu).toContain("item.isDefault");
    expect(menu).toContain("item.onWorkbench && \"text-muted-foreground\"");
    expect(menu).toContain("collisionPadding={16}");
    expect(menu).not.toContain("w-[18.5rem]");
    expect(menu).not.toContain("nav.project.openProject");
    expect(lib).toContain("dialogDesktop");
    expect(lib).toContain("JOINABLE_RECENT_PREVIEW_COUNT = 8");
    const hosts = sourceOf("src/renderer/components/modules/remote/remote-hosts-menu.tsx");
    expect(hosts).toContain("AppMenuSub");
    expect(hosts).not.toMatch(/desktop-api/);
    expect(menu).not.toContain("REMOTE_CONNECT_GATES");
  });

  it("moves the empty homepage composer with interpolatable flex-grow, not justify-content", () => {
    const leftMain = sourceOf("src/renderer/components/layout/left-main-area.tsx");
    const chatCss = sourceOf("src/renderer/styles/tokens/chat.css");
    expect(leftMain).toContain("data-homepage-composer-trail");
    expect(leftMain).toContain("@xl:grow");
    expect(leftMain).toContain("@xl:pb-[var(--height-titlebar)]");
    expect(leftMain).not.toContain("@xl:justify-center");
    expect(leftMain).not.toContain("justify-end");
    expect(chatCss).toContain("flex-grow 220ms var(--lsb-toggle-ease)");
    expect(chatCss).toContain("padding-bottom 220ms var(--lsb-toggle-ease)");
    expect(chatCss).toContain("data-homepage-composer-motion");
    expect(chatCss).not.toContain("data-homepage-composer-rising");
  });

  it("lets an empty homepage chat pick a workbench project, not a chat that already has messages", () => {
    const leftMain = sourceOf("src/renderer/components/layout/left-main-area.tsx");
    const selector = sourceOf("src/renderer/components/modules/chat/project-selector.tsx");
    const menu = sourceOf("src/renderer/components/layout/workbench-add-menu.tsx");
    const lib = sourceOf("src/renderer/lib/workspace/project-lifecycle.ts");
    expect(leftMain).toContain("ProjectSelector");
    expect(leftMain.match(/<ProjectSelector /g)?.length).toBe(1);
    expect(selector).toContain("WorkbenchProjectPicker");
    expect(selector).toContain("assignSessionToProjectPath");
    expect(selector).toContain("pickFolderAndAssignSession");
    expect(selector).toContain("CHAT_PANEL_TOOLBAR_BUTTON");
    expect(selector).not.toContain("AppMenuCheckItem");
    expect(selector).not.toContain("openRecentFromAddPanel");
    expect(menu).toContain("export function WorkbenchProjectPicker");
    expect(lib).toContain("assignSessionToProjectPath");
    expect(lib).toContain("assignSessionProject");
    expect(lib).toContain("agentReassignSessionProject");
    expect(lib).toContain("_setSessionCwd");
  });

  it("edits a workbench project through lib → desktop-api, not the dialog", () => {
    const dialog = sourceOf("src/renderer/components/modules/project/edit-project-dialog.tsx");
    const lib = sourceOf("src/renderer/lib/workspace/edit-project.ts");
    expect(dialog).not.toMatch(/desktop-api/);
    expect(dialog).not.toContain("LiveStructurePreview");
    expect(dialog).not.toContain("revealProjectFolder");
    expect(dialog).toContain("loadEditProjectDraft");
    expect(dialog).toContain("saveEditProject");
    expect(lib).toContain("useWorkbenchStore");
    expect(lib).not.toContain("projectDesktop");
    expect(lib).toContain("fsDesktop");
    expect(lib).not.toContain("loadProjectIconsById");
    expect(dialog).not.toContain("IconPicker");
  });
});
