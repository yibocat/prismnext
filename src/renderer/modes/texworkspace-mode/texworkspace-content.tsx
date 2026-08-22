import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { RightTab } from "@/lib/workspace/mode-registry";
import { NoFileOpen } from "@/components/modules/editor/no-file-open";
import { TabContext, type TabContextValue } from "@/lib/workspace/tab-context";
import { resolveViewer, wrapTabContext } from "@/lib/workspace/mode-utils";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useLayoutStore } from "@/stores/layout-store";
import { Button } from "@/components/ui/button";
import { FileTextIcon } from "lucide-react";
import { TexworkspaceToolbar } from "./texworkspace-toolbar";

export function TexworkspaceContent({ tab, isActive }: { tab: RightTab; isActive: boolean }) {
  const { t } = useTranslation();
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);

  const ctx: TabContextValue = useMemo(
    () => ({ tab, isActive }),
    [tab, isActive],
  );

  // Block when no manuscript is configured — TeX workspace requires it
  if (!manuscriptConfig) {
    return wrapTabContext(
      ctx,
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <FileTextIcon className="size-12 text-muted-foreground/20" />
        <div className="space-y-1.5 text-center">
          <p className="text-[length:var(--font-placeholder)] text-muted-foreground font-medium">
            {t("modes.texworkspace.noManuscript")}
          </p>
          <p className="text-sm text-muted-foreground/60 max-w-[320px]">
            {t("modes.texworkspace.noManuscriptHint")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            useLayoutStore.getState().setLeftSidebarView("settings");
            useLayoutStore.getState().setSettingsCategory("texworkspace");
          }}
        >
          {t("modes.texworkspace.openSettings")}
        </Button>
      </div>,
    );
  }

  if (tab.kind !== "texworkspace" || tab.isInitial || !tab.filePath) {
    return wrapTabContext(ctx, <NoFileOpen />);
  }
  return wrapTabContext(ctx, resolveViewer(tab.filePath));
}

export function TexworkspaceToolbarWrapper({ tab }: { tab: RightTab }) {
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  // Block compile when no manuscript is configured
  const compileFile = manuscriptConfig && tab.kind === "texworkspace" ? (tab.fileId ?? null) : null;
  return <TexworkspaceToolbar compileFile={compileFile} />;
}
