import { useState, useEffect, useCallback, useRef } from "react";
import { TemplateMeta, TemplateFull, TemplateCategory } from "./types";
import { getTemplates } from "@/lib/templates/template-data";
import { TemplateSidebar, DetailSidebar } from "./template-sidebar";
import { GalleryView } from "./template-gallery";
import { DetailView } from "./template-detail";
import { TemplateSwitchDialog } from "./template-switch-dialog";
import { getCompatibilityLevel, mergeFile } from "@/lib/templates/template-merge";
import { useDocumentStore } from "@/stores/document-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { DEFAULT_MANUSCRIPT_DIR } from "@/types/workspace";
import { useLayoutStore } from "@/stores/layout-store";
import { toast } from "sonner";

// ─── Props ───

export interface TemplateCenterProps {
  onUseTemplate: (template: TemplateFull) => void;
  onBack: () => void;
}

// ─── Main ───

export function TemplateCenter({ onUseTemplate, onBack }: TemplateCenterProps) {
  const [templates, setTemplates] = useState<TemplateMeta[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTemplates().then((data) => { if (!cancelled) setTemplates(data); });
    return () => { cancelled = true; };
  }, []);
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TemplateFull | null>(null);

  // Template switch dialog state
  const [switchDialog, setSwitchDialog] = useState<{
    open: boolean;
    level: "L1" | "L2" | "L3" | "reset" | "firstUse";
    oldName?: string;
    newName: string;
    oldCategory?: string;
    newCategory: string;
    changedFiles: string[];
    deletedFiles: string[];
    newTemplate: TemplateFull | null;
  }>({
    open: false,
    level: "L1",
    oldName: "",
    newName: "",
    oldCategory: "",
    newCategory: "",
    changedFiles: [],
    deletedFiles: [],
    newTemplate: null,
  });

  const [currentTemplate, setCurrentTemplate] = useState<{
    id: string;
    category: string;
    appliedFiles: Record<string, string>;
  } | null>(null);

  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const manuscriptConfig = useWorkspaceConfigStore((s) => s.manuscriptConfig);
  const manuscriptDir = manuscriptConfig?.dir ?? DEFAULT_MANUSCRIPT_DIR;
  const processingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!projectRoot) return;
    let cancelled = false;
    (async () => {
      try {
        const settingsPath = `${projectRoot}/.prismnext/settings.json`;
        const exists = await window.electronAPI.fsExists(settingsPath);
        if (!exists || cancelled) return;
        const readResult = await window.electronAPI.fsRead(settingsPath);
        if (!readResult || cancelled) return;
        const settings = JSON.parse(readResult.content);
        if (settings.template && settings.template.id) {
          setCurrentTemplate({
            id: settings.template.id,
            category: settings.template.category || "",
            appliedFiles: settings.template.appliedFiles || {},
          });
        }
      } catch {
        // No template state — first use
      }
    })();
    return () => { cancelled = true; };
  }, [projectRoot]);

  const handleSelect = async (t: TemplateMeta) => {
    const full = await window.electronAPI.templateGet(t.id);
    if (full) setSelected(full);
  };

  const handleUseWithDetection = useCallback(
    async (t: TemplateMeta) => {
      // Prevent concurrent detection while a flow is in progress
      if (processingRef.current) return;
      processingRef.current = true;

      const full = await window.electronAPI.templateGet(t.id);
      if (!full) {
        processingRef.current = false;
        return;
      }

      // No current template — first use.
      // Check for existing files that would be overwritten.
      if (!currentTemplate || !projectRoot) {
        if (!projectRoot) {
          processingRef.current = false;
          onUseTemplate(full);
          return;
        }

        // Detect user files that overlap with template files
        const overlapping: string[] = [];
        for (const file of full.files) {
          const absPath = `${projectRoot}/${manuscriptDir}/${file.path}`;
          try {
            const exists = await window.electronAPI.fsExists(absPath);
            if (exists) overlapping.push(file.path);
          } catch {
            // Ignore errors — if we can't check, assume safe
          }
        }

        if (overlapping.length === 0) {
          // Clean project — apply directly
          processingRef.current = false;
          onUseTemplate(full);
          toast.success(`Template "${full.name}" applied`);
          return;
        }

        // Existing files detected — show confirmation dialog
        setSwitchDialog({
          open: true,
          level: "firstUse",
          oldName: undefined,
          newName: full.name,
          oldCategory: undefined,
          newCategory: full.category,
          changedFiles: overlapping,
          deletedFiles: [],
          newTemplate: full,
        });
        return;
      }

      // Same template — check if user wants to reset
      if (currentTemplate.id === t.id) {
        const changes = await window.electronAPI.templateDetectChanges({
          rootPath: projectRoot,
          manuscriptDir,
          appliedFiles: currentTemplate.appliedFiles,
        });
        const hasChanges = changes.changed.length > 0 || changes.deleted.length > 0;
        if (!hasChanges) {
          processingRef.current = false;
          return; // No changes, nothing to do
        }

        const oldFull = await window.electronAPI.templateGet(currentTemplate.id);
        setSwitchDialog({
          open: true,
          level: "reset",
          oldName: oldFull?.name || currentTemplate.id,
          newName: full.name,
          oldCategory: currentTemplate.category,
          newCategory: full.category,
          changedFiles: changes.changed,
          deletedFiles: changes.deleted,
          newTemplate: full,
        });
        return;
      }

      // Different template — detect changes
      const changes = await window.electronAPI.templateDetectChanges({
        rootPath: projectRoot,
        manuscriptDir,
        appliedFiles: currentTemplate.appliedFiles,
      });
      const hasChanges = changes.changed.length > 0 || changes.deleted.length > 0;

      if (!hasChanges) {
        // No changes — silent switch
        try {
          await window.electronAPI.templateApply({
            rootPath: projectRoot,
            manuscriptDir,
            files: full.files,
            templateId: full.id,
            templateCategory: full.category,
          });
          // Update local state from the saved settings
          const settingsPath = `${projectRoot}/.prismnext/settings.json`;
          const updatedResult = await window.electronAPI.fsRead(settingsPath);
          if (updatedResult) {
            const updated = JSON.parse(updatedResult.content);
            if (updated.template) {
              setCurrentTemplate({
                id: updated.template.id,
                category: updated.template.category,
                appliedFiles: updated.template.appliedFiles,
              });
            }
          }
          useDocumentStore.getState().refreshFiles();
          useLayoutStore.getState().setLeftSidebarView("sessions");
          toast.success(`Switched to "${full.name}"`);
        } catch {
          onUseTemplate(full);
        }
        processingRef.current = false;
        return;
      }

      // Has changes — determine level and show dialog
      const level = getCompatibilityLevel(currentTemplate.category, full.category);
      const oldFull = await window.electronAPI.templateGet(currentTemplate.id);
      setSwitchDialog({
        open: true,
        level,
        oldName: oldFull?.name || currentTemplate.id,
        newName: full.name,
        oldCategory: currentTemplate.category,
        newCategory: full.category,
        changedFiles: changes.changed,
        deletedFiles: changes.deleted,
        newTemplate: full,
      });
    },
    [currentTemplate, projectRoot, manuscriptDir, onUseTemplate],
  );

  const handleSwitchConfirm = useCallback(
    async (action: "merge" | "replace") => {
      const { newTemplate, changedFiles, deletedFiles, level } = switchDialog;
      if (!newTemplate || !projectRoot) return;
      // currentTemplate can be null for firstUse
      if (level !== "firstUse" && !currentTemplate) return;

      setSubmitting(true);
      try {
        // ── firstUse: backup overlapping files, then apply directly ──
        if (level === "firstUse") {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backupLabel = `${timestamp}_first_use_${newTemplate.id}`;
          await window.electronAPI.templateBackup({
            rootPath: projectRoot,
            manuscriptDir,
            files: changedFiles,
            backupLabel,
          });

          await window.electronAPI.templateApply({
            rootPath: projectRoot,
            manuscriptDir,
            files: newTemplate.files,
            templateId: newTemplate.id,
            templateCategory: newTemplate.category,
          });

          // Update local state
          const settingsPath = `${projectRoot}/.prismnext/settings.json`;
          try {
            const updatedResult = await window.electronAPI.fsRead(settingsPath);
            if (updatedResult) {
              const updated = JSON.parse(updatedResult.content);
              if (updated.template) {
                setCurrentTemplate({
                  id: updated.template.id,
                  category: updated.template.category,
                  appliedFiles: updated.template.appliedFiles,
                });
              }
            }
          } catch { /* ignore */ }

          useDocumentStore.getState().refreshFiles();
          useLayoutStore.getState().setLeftSidebarView("sessions");
          toast.success(`Template "${newTemplate.name}" applied — previous files backed up`);
          setSwitchDialog((prev) => ({ ...prev, open: false }));
          processingRef.current = false;
          setSubmitting(false);
          return;
        }

        // ── Existing template switch/reset flow ──
        if (!currentTemplate) return; // TypeScript guard

        const allTemplateFiles = [
          ...new Set([
            ...Object.keys(currentTemplate.appliedFiles),
            ...newTemplate.files.map((f) => f.path),
          ]),
        ];

        // 1. Backup current files
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupLabel = `${timestamp}_${currentTemplate.id}_to_${newTemplate.id}`;
        await window.electronAPI.templateBackup({
          rootPath: projectRoot,
          manuscriptDir,
          files: allTemplateFiles,
          backupLabel,
        });

        // 2. Prepare files for apply
        let filesToApply = newTemplate.files;

        if (action === "merge") {
          const mergedFiles: { path: string; content: string }[] = [];
          for (const newFile of newTemplate.files) {
            const isChanged =
              changedFiles.includes(newFile.path) || deletedFiles.includes(newFile.path);
            let oldContent = "";
            if (isChanged) {
              try {
                const oldResult =
                  await window.electronAPI.fsRead(
                    `${projectRoot}/${manuscriptDir}/${newFile.path}`,
                  );
                oldContent = oldResult?.content || "";
              } catch {
                oldContent = "";
              }
            }
            const mergedContent = mergeFile(
              oldContent,
              newFile.content,
              newFile.path,
              isChanged,
            );
            mergedFiles.push({ path: newFile.path, content: mergedContent });
          }

          // Keep old-only files that the user may reference
          const newFilePaths = new Set(newTemplate.files.map((f) => f.path));
          for (const oldPath of Object.keys(currentTemplate.appliedFiles)) {
            if (!newFilePaths.has(oldPath)) {
              try {
                const readResult = await window.electronAPI.fsRead(
                  `${projectRoot}/${manuscriptDir}/${oldPath}`,
                );
                if (readResult?.content) {
                  mergedFiles.push({ path: oldPath, content: readResult.content });
                }
              } catch {
                // File no longer exists — skip
              }
            }
          }
          filesToApply = mergedFiles;
        }

        // 3. Apply new template
        await window.electronAPI.templateApply({
          rootPath: projectRoot,
          manuscriptDir,
          files: filesToApply,
          templateId: newTemplate.id,
          templateCategory: newTemplate.category,
        });

        // Update local template state
        const settingsPath = `${projectRoot}/.prismnext/settings.json`;
        try {
          const updatedResult = await window.electronAPI.fsRead(settingsPath);
          if (updatedResult) {
            const updated = JSON.parse(updatedResult.content);
            if (updated.template) {
              setCurrentTemplate({
                id: updated.template.id,
                category: updated.template.category,
                appliedFiles: updated.template.appliedFiles,
              });
            }
          }
        } catch {
          /* ignore */
        }

        // 4. Refresh file tree and navigate back
        useDocumentStore.getState().refreshFiles();
        useLayoutStore.getState().setLeftSidebarView("sessions");

        // 4.5. Notify user
        const msg = switchDialog.level === "firstUse"
          ? `Template "${newTemplate.name}" applied — previous files backed up`
          : switchDialog.level === "L1"
          ? `Switched to "${newTemplate.name}" — content preserved`
          : switchDialog.level === "L2"
            ? `Switched to "${newTemplate.name}" — content merged. Review recommended.`
            : switchDialog.level === "reset"
              ? `"${newTemplate.name}" reset to original — previous content backed up`
              : `Switched to "${newTemplate.name}" — previous content backed up`;
        toast.success(msg);

        // 5. Close dialog
        setSwitchDialog((prev) => ({ ...prev, open: false }));
        processingRef.current = false;
      } catch (err) {
        console.error("Template switch failed:", err);
        toast.error(`Failed to switch template: ${err instanceof Error ? err.message : "Unknown error"}`);
        // Dialog stays open — user can try again or cancel
      } finally {
        setSubmitting(false);
      }
    },
    [switchDialog, projectRoot, manuscriptDir, currentTemplate],
  );

  return (
    <div className="flex-1 overflow-y-auto @container">
      <div className="max-w-5xl mx-auto px-8 flex flex-col @lg:flex-row min-h-0 flex-1">
        {/* Left sidebar */}
        {selected ? (
          <DetailSidebar template={selected} />
        ) : (
          <TemplateSidebar
            category={category}
            setCategory={setCategory}
          />
        )}

        {/* Right content area */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <DetailView
              template={selected}
              onBack={() => setSelected(null)}
              onUse={handleUseWithDetection}
            />
          ) : (
            <GalleryView
              templates={templates}
              category={category}
              search={search}
              setSearch={setSearch}
              onSelect={handleSelect}
              onUse={handleUseWithDetection}
            />
          )}
        </div>
      </div>

      {/* Template switch confirmation dialog */}
      <TemplateSwitchDialog
        open={switchDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            processingRef.current = false;
            setSubmitting(false);
          }
          setSwitchDialog((prev) => ({ ...prev, open }));
        }}
        level={switchDialog.level}
        oldName={switchDialog.oldName}
        newName={switchDialog.newName}
        oldCategory={switchDialog.oldCategory}
        newCategory={switchDialog.newCategory}
        changedFiles={switchDialog.changedFiles}
        deletedFiles={switchDialog.deletedFiles}
        onConfirm={handleSwitchConfirm}
        submitting={submitting}
      />
    </div>
  );
}
