import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TemplateMeta, TemplateFull, TemplateCategory } from "./types";
import { getTemplates, invalidateTemplatesCache } from "@/lib/templates/template-data";
import { TemplateSidebar, DetailSidebar } from "./template-sidebar";
import { GalleryView } from "./template-gallery";
import { DetailView } from "./template-detail";
import { TemplateSwitchDialog } from "./template-switch-dialog";
import {
  requestApplyTemplate,
  confirmApplyTemplate,
  type TemplateSwitchDialogState,
} from "@/lib/templates/apply-template-flow";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectTemplate } from "@/hooks/use-project-template";
import { toast } from "sonner";
import { ArrowLeftIcon } from "lucide-react";

export interface TemplateCenterProps {
  onBack: () => void;
}

const EMPTY_DIALOG: TemplateSwitchDialogState = {
  open: false,
  level: "L1",
  newName: "",
  newCategory: "",
  changedFiles: [],
  deletedFiles: [],
  newTemplate: null,
  dialogActions: [],
};

export function TemplateCenter({ onBack }: TemplateCenterProps) {
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TemplateFull | null>(null);
  const [switchDialog, setSwitchDialog] = useState<TemplateSwitchDialogState>(EMPTY_DIALOG);
  const [submitting, setSubmitting] = useState(false);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const workspaceLoaded = useWorkspaceConfigStore((s) => s.loaded);
  const { state: currentTemplate, loading: templateLoading, reload } = useProjectTemplate();

  const processingRef = useRef(false);
  const dialogResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleDialogReset = useCallback(() => {
    if (dialogResetTimerRef.current) clearTimeout(dialogResetTimerRef.current);
    dialogResetTimerRef.current = setTimeout(() => {
      setSwitchDialog(EMPTY_DIALOG);
      dialogResetTimerRef.current = null;
    }, 250);
  }, []);

  const closeSwitchDialog = useCallback(() => {
    setSwitchDialog((prev) => ({ ...prev, open: false }));
    scheduleDialogReset();
  }, [scheduleDialogReset]);

  const canApply = Boolean(projectRoot && workspaceLoaded && manuscriptConfig && !templateLoading);

  useEffect(() => {
    return () => {
      if (dialogResetTimerRef.current) clearTimeout(dialogResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    invalidateTemplatesCache();
    getTemplates({ refresh: true }).then((data) => {
      if (!cancelled) setTemplates(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const flowContext = useMemo(() => {
    if (!projectRoot || !manuscriptConfig) return null;
    return {
      projectRoot,
      manuscriptDir: manuscriptConfig.dir,
      currentTemplate,
      reloadTemplate: reload,
    };
  }, [projectRoot, manuscriptConfig, currentTemplate, reload]);

  const handleUse = useCallback(
    async (t: TemplateMeta) => {
      if (processingRef.current) return;

      if (!projectRoot) {
        toast.error("Open a project before applying a template.");
        return;
      }
      if (!workspaceLoaded) {
        toast.info("Loading workspace configuration…");
        return;
      }
      if (!manuscriptConfig) {
        toast.error("Configure a manuscript folder in Workspace settings first.");
        useLayoutStore.getState().setLeftSidebarView("settings");
        useLayoutStore.getState().setSettingsCategory("workspace");
        return;
      }
      if (templateLoading) return;

      if (!flowContext) return;

      processingRef.current = true;
      try {
        const result = await requestApplyTemplate(t, flowContext);
        if (result.type === "dialog") {
          setSwitchDialog(result.dialog);
        }
      } catch (err) {
        toast.error(
          `Failed to apply template: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        processingRef.current = false;
      }
    },
    [projectRoot, workspaceLoaded, manuscriptConfig, templateLoading, flowContext],
  );

  const handleSwitchConfirm = useCallback(
    async (action: "merge" | "replace") => {
      if (!flowContext) return;
      setSubmitting(true);
      try {
        await confirmApplyTemplate(switchDialog, action, flowContext);
        closeSwitchDialog();
      } catch (err) {
        toast.error(
          `Failed to switch template: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        setSubmitting(false);
        processingRef.current = false;
      }
    },
    [switchDialog, flowContext, closeSwitchDialog],
  );

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="max-w-6xl mx-auto w-full px-8 pt-8 pb-8">
        <h2 className="text-[length:var(--font-session-item)] font-semibold mb-6 hidden lg:block">
          {selected ? selected.name : "Template Center"}
        </h2>
        <div className="flex flex-col lg:flex-row lg:items-start min-h-0 gap-6">
        <div className="shrink-0 w-full lg:w-[200px]">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[length:var(--font-size-12)] text-muted-foreground hover:text-foreground transition-colors mb-4 lg:hidden"
            onClick={onBack}
          >
            <ArrowLeftIcon className="size-3.5" />
            Back
          </button>
          {!canApply && projectRoot && workspaceLoaded && !manuscriptConfig && (
            <p className="mb-4 text-[length:var(--font-size-12)] text-destructive lg:hidden">
              Bind a manuscript folder in Workspace settings to apply templates.
            </p>
          )}
          {selected ? (
            <DetailSidebar template={selected} />
          ) : (
            <TemplateSidebar category={category} setCategory={setCategory} templates={templates} />
          )}
        </div>

        <div className="flex-1 min-w-0 @container">
          {selected ? (
            <DetailView
              template={selected}
              onBack={() => setSelected(null)}
              onUse={handleUse}
              canApply={canApply}
              applyDisabledReason={
                !projectRoot
                  ? "Open a project first"
                  : templateLoading
                    ? "Loading…"
                    : !manuscriptConfig
                      ? "Configure manuscript folder"
                      : undefined
              }
            />
          ) : (
            <GalleryView
              templates={templates}
              category={category}
              setCategory={setCategory}
              search={search}
              setSearch={setSearch}
              onSelect={async (t) => {
                const full = await window.electronAPI.templateGet(t.id);
                if (full) setSelected(full);
              }}
              onUse={handleUse}
              canApply={canApply}
            />
          )}
        </div>
        </div>
      </div>

      <TemplateSwitchDialog
        open={switchDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            processingRef.current = false;
            setSubmitting(false);
            setSwitchDialog((prev) => ({ ...prev, open: false }));
            scheduleDialogReset();
          } else {
            if (dialogResetTimerRef.current) {
              clearTimeout(dialogResetTimerRef.current);
              dialogResetTimerRef.current = null;
            }
            setSwitchDialog((prev) => ({ ...prev, open }));
          }
        }}
        level={switchDialog.level}
        oldName={switchDialog.oldName}
        newName={switchDialog.newName}
        oldCategory={switchDialog.oldCategory}
        newCategory={switchDialog.newCategory}
        changedFiles={switchDialog.changedFiles}
        deletedFiles={switchDialog.deletedFiles}
        dialogActions={switchDialog.dialogActions}
        onConfirm={handleSwitchConfirm}
        submitting={submitting}
      />
    </div>
  );
}
