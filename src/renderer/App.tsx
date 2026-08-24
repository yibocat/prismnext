import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { registerLeftNavItems } from "@/lib/workspace/left-nav/items";
import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";
import { useDocumentStore } from "@/stores/document-store";
import { restoreWorkbenchLaunch } from "@/lib/workspace/project-lifecycle";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { injectDiffOverrides } from "@/lib/editor-themes/diff-overrides";
import { registerAllModes } from "@/modes/_register";
import { AppCommandPalette, GlobalErrorBoundary } from "@/components/modules/shared";
import { ProjectSetupDialog } from "@/components/modules/project";
import { PrismRibbonMark } from "@/components/brand/prism-ribbon-mark";
import { Toaster } from "@/components/ui/sonner";
import { TabCloseConfirmDialog } from "@/components/layout/tab-close-confirm-dialog";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";
import { ShellFrame } from "@/components/layout/shell-frame";
import { useAppCloseTab } from "@/hooks/use-app-close-tab";
import { useAppShellShortcuts } from "@/hooks/use-app-shell-shortcuts";
import { useProductShortcuts } from "@/hooks/use-product-shortcuts";
import { useWorkspaceModeShortcuts } from "@/hooks/use-workspace-mode-shortcuts";
import { executionDesktop } from "@/lib/desktop-api/execution";
import { useExecutionStore } from "@/stores/execution-store";
import { useAiTerminalSweep } from "@/hooks/use-ai-terminal-sweep";
import { useSkillsIntegrationEvents } from "@/hooks/use-skills-integration-events";
import { useAgentCompilePreview } from "@/hooks/use-agent-compile-preview";
import { LocaleSync } from "@/lib/i18n/locale-sync";

import { ContentTopBar } from "@/components/layout/content-top-bar";
import { LeftSidebarPinnedChrome, RightAreaPinnedChrome, StatusDotPinnedChrome } from "@/components/layout/sidebar-controls";
import {
  expandSettingsDetailPanel,
  closeSettingsDetailPanel,
} from "@/lib/workspace/expand-settings-detail-panel";
import { collapseRightAreaWhenEmpty } from "@/lib/workspace/close-active-tab";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  openRightArea,
  resetRightAreaForProjectOpen,
  watchRightAreaToggleAnimation,
} from "@/lib/workspace/right-area-layout";
import {
  syncSettingsDetailPresence,
  syncShellForLeftSidebarView,
} from "@/lib/workspace/shell-view-sync";
import { syncLeftSidebarWidthVar } from "@/lib/workspace/left-sidebar-panel";

registerAllModes();
registerLeftNavItems();

/** Inside ThemeProvider — reapplies native glass when light/dark class settles.
 *  Wait until disk theme is loaded so the in-memory default (glass off) cannot
 *  flip native vibrancy off and back on. */
function GlassNativeSync() {
  const { resolvedTheme } = useTheme();
  const glassEffect = useThemeStore((s) => s.config.glassEffect);
  const themeHydrated = useThemeStore((s) => s.hydrated);
  useEffect(() => {
    if (!themeHydrated) return;
    useThemeStore.getState().syncNativeGlass();
  }, [resolvedTheme, glassEffect, themeHydrated]);
  return null;
}

export function App() {
  const isMobile = useIsMobile();
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const hydrateProLicense = useProLicenseStore((s) => s.hydrate);
  const initTheme = useThemeStore((s) => s.loadConfig);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const isOpeningProject = useDocumentStore((s) => s.isOpeningProject);
  const inSettings = leftSidebarView === "settings";
  const hasSettingsEditorTab = useRightPanelStore((s) =>
    s.tabs.some((t) => t.kind === "settings-editor"),
  );
  const settingsDetailOpen = inSettings && hasSettingsEditorTab;
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);

  useEffect(() => {
    return useRightPanelStore.subscribe((state, prev) => {
      if (state.tabs.length === 0 && prev.tabs.length > 0) {
        collapseRightAreaWhenEmpty();
      }
    });
  }, []);

  useAppCloseTab();
  useEffect(() => watchRightAreaToggleAnimation(), []);
  useLayoutEffect(() => {
    syncLeftSidebarWidthVar(sidebarWidth);
  }, [sidebarWidth]);
  useAppShellShortcuts({ isMobile });
  useWorkspaceModeShortcuts({ isMobile });
  useProductShortcuts();
  useEffect(() => {
    return executionDesktop.onExecutionEvent((event) => {
      const store = useExecutionStore.getState();
      store.applyEvent(event);
      if (event.type !== "created" && event.type !== "started") return;
      void (async () => {
        await store.hydrate(event.executionId);
        const summary = useExecutionStore.getState().byId[event.executionId]?.summary;
        if (summary) useExecutionStore.getState().onExecutionCreated(summary);
      })();
    });
  }, []);
  useAiTerminalSweep();
  useSkillsIntegrationEvents();
  useAgentCompilePreview();

  const rightAreaExpandNonce = useLayoutStore((s) => s.rightAreaExpandNonce);
  const settingsDetailCloseNonce = useLayoutStore((s) => s.settingsDetailCloseNonce);

  useLayoutEffect(() => {
    if (rightAreaExpandNonce === 0) return;
    const st = useLayoutStore.getState();
    if (st.editorMaximized) return;
    if (st.leftSidebarView === "settings" && hasOpenSettingsEditor()) {
      expandSettingsDetailPanel();
      return;
    }
    openRightArea({ isMobile });
  }, [rightAreaExpandNonce, isMobile]);

  useLayoutEffect(() => {
    if (settingsDetailCloseNonce === 0) return;
    closeSettingsDetailPanel();
  }, [settingsDetailCloseNonce]);

  useLayoutEffect(() => {
    if (!projectRoot) return;
    resetRightAreaForProjectOpen();
  }, [projectRoot]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void hydrateProLicense();
  }, [hydrateProLicense]);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    injectDiffOverrides();
  }, []);

  const messageWidth = useSettingsStore((s) => s.settings.messageWidth);
  useEffect(() => {
    if (!messageWidth) return;
    document.documentElement.setAttribute("data-message-width", messageWidth);
  }, [messageWidth]);

  const prevLeftSidebarViewRef = useRef(leftSidebarView);
  useLayoutEffect(() => {
    const prev = prevLeftSidebarViewRef.current;
    prevLeftSidebarViewRef.current = leftSidebarView;
    if (prev === leftSidebarView) return;
    syncShellForLeftSidebarView(prev, leftSidebarView, { isMobile });
  }, [leftSidebarView, isMobile]);

  useLayoutEffect(() => {
    if (!inSettings) return;
    syncSettingsDetailPresence(settingsDetailOpen);
  }, [inSettings, settingsDetailOpen]);

  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);

  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        await restoreWorkbenchLaunch();
        if (cancelled) return;
      } catch (err) {
        console.error("[app] workbench launch failed", err);
      } finally {
        if (!cancelled) setAutoOpenChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsLoaded]);
  const appReady =
    settingsLoaded &&
    autoOpenChecked &&
    (Boolean(projectRoot) ? !isOpeningProject : true);

  useEffect(() => {
    if (!appReady) return;
    if ((window as any).__FREEZE_SPLASH__) return;
    const el = document.getElementById("L");
    if (!el) return;
    el.remove();
  }, [appReady]);

  const shell = (
    <div className="relative flex h-full flex-col">
      <LeftSidebarPinnedChrome />
      <ShellFrame
        overlay={
          <>
            <StatusDotPinnedChrome />
            <RightAreaPinnedChrome />
          </>
        }
        left={<LeftSidebar />}
        center={
          <div className="flex h-full min-w-0 flex-col">
            <ContentTopBar />
            <div className="min-h-0 flex-1">
              <LeftMainArea />
            </div>
          </div>
        }
        right={<RightArea />}
      />
    </div>
  );

  return (
    <GlobalErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <LocaleSync />
        <GlassNativeSync />
        <ProjectSetupDialog />
        <AppCommandPalette isMobile={isMobile} />
        <Toaster />
        <TabCloseConfirmDialog />
        {isOpeningProject && appReady ? (
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-background"
            aria-busy
            aria-label="Loading project"
          >
            <div className="flex flex-col items-center gap-3.5">
              <div className="flex size-14 items-center justify-center rounded-[14px] border border-border bg-card shadow-sm">
                <PrismRibbonMark className="size-8" />
              </div>
              <div className="text-[22px] font-semibold tracking-tight text-foreground">
                PrismNext
              </div>
              <div className="mt-1 h-[3px] w-40 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full w-[35%] rounded-sm bg-foreground/50"
                  style={{ animation: "loading-bar 1.2s ease-in-out infinite" }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {shell}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
