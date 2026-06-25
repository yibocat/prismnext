import type { TemplateFull } from "@/components/modules/templates/types";
import type { ProjectTemplateState } from "@/lib/templates/project-template-state";
import { loadProjectTemplate } from "@/lib/templates/project-template-state";
import {
  getTemplateSwitchStrategy,
  mergeFile,
  type SwitchDialogLevel,
} from "@/lib/templates/template-merge";
import { clearPdfCache } from "@/stores/compile-store";
import { useDocumentStore } from "@/stores/document-store";
import { toast } from "sonner";

export interface TemplateSwitchDialogState {
  open: boolean;
  level: SwitchDialogLevel;
  oldName?: string;
  newName: string;
  oldCategory?: string;
  newCategory: string;
  changedFiles: string[];
  deletedFiles: string[];
  newTemplate: TemplateFull | null;
  dialogActions: ("merge" | "replace")[];
}

export interface ApplyTemplateFlowContext {
  projectRoot: string;
  manuscriptDir: string;
  currentTemplate: ProjectTemplateState | null;
  reloadTemplate: () => Promise<void>;
}

export type ApplyTemplateFlowResult =
  | { type: "noop"; message?: string }
  | { type: "applied"; templateName: string }
  | { type: "dialog"; dialog: TemplateSwitchDialogState };

async function findOverlappingFiles(
  projectRoot: string,
  manuscriptDir: string,
  files: { path: string }[],
): Promise<string[]> {
  const overlapping: string[] = [];
  for (const file of files) {
    const absPath = `${projectRoot}/${manuscriptDir}/${file.path}`;
    try {
      const exists = await window.electronAPI.fsExists(absPath);
      if (exists) overlapping.push(file.path);
    } catch {
      // skip
    }
  }
  return overlapping;
}

async function applyFiles(
  ctx: ApplyTemplateFlowContext,
  template: TemplateFull,
  files: { path: string; content: string }[],
): Promise<ProjectTemplateState | null> {
  const result = await window.electronAPI.templateApply({
    rootPath: ctx.projectRoot,
    manuscriptDir: ctx.manuscriptDir,
    files,
    templateId: template.id,
    templateCategory: template.category,
  });
  clearPdfCache();
  useDocumentStore.getState().refreshFiles();
  await ctx.reloadTemplate();
  return result?.appliedFiles
    ? {
        id: template.id,
        category: template.category,
        appliedAt: new Date().toISOString(),
        appliedFiles: result.appliedFiles,
      }
    : await loadProjectTemplate(ctx.projectRoot);
}

/**
 * Decide what happens when user clicks Use — may return a dialog payload or apply directly.
 */
export async function requestApplyTemplate(
  templateMeta: { id: string; name: string; category: string },
  ctx: ApplyTemplateFlowContext,
): Promise<ApplyTemplateFlowResult> {
  const full = await window.electronAPI.templateGet(templateMeta.id);
  if (!full) {
    toast.error("Template could not be loaded.");
    return { type: "noop" };
  }

  const current = ctx.currentTemplate;

  if (!current) {
    const overlapping = await findOverlappingFiles(
      ctx.projectRoot,
      ctx.manuscriptDir,
      full.files,
    );
    if (overlapping.length === 0) {
      await applyFiles(ctx, full, full.files);
      toast.success(`Template "${full.name}" applied`);
      return { type: "applied", templateName: full.name };
    }
    const strategy = getTemplateSwitchStrategy("", full.category, {
      sameTemplate: false,
      hasChanges: true,
      isFirstUse: true,
    });
    return {
      type: "dialog",
      dialog: {
        open: true,
        level: strategy.level,
        newName: full.name,
        newCategory: full.category,
        changedFiles: overlapping,
        deletedFiles: [],
        newTemplate: full,
        dialogActions: strategy.dialogActions,
      },
    };
  }

  if (current.id === full.id) {
    const changes = await window.electronAPI.templateDetectChanges({
      rootPath: ctx.projectRoot,
      manuscriptDir: ctx.manuscriptDir,
      appliedFiles: current.appliedFiles,
    });
    const hasChanges = changes.changed.length > 0 || changes.deleted.length > 0;
    if (!hasChanges) {
      toast.info(`"${full.name}" is already the current template with no modifications.`);
      return { type: "noop", message: "already_current" };
    }
    const strategy = getTemplateSwitchStrategy(current.category, full.category, {
      sameTemplate: true,
      hasChanges: true,
      isFirstUse: false,
    });
    return {
      type: "dialog",
      dialog: {
        open: true,
        level: strategy.level,
        oldName: full.name,
        newName: full.name,
        oldCategory: current.category,
        newCategory: full.category,
        changedFiles: changes.changed,
        deletedFiles: changes.deleted,
        newTemplate: full,
        dialogActions: strategy.dialogActions,
      },
    };
  }

  const changes = await window.electronAPI.templateDetectChanges({
    rootPath: ctx.projectRoot,
    manuscriptDir: ctx.manuscriptDir,
    appliedFiles: current.appliedFiles,
  });
  const hasChanges = changes.changed.length > 0 || changes.deleted.length > 0;

  if (!hasChanges) {
    await applyFiles(ctx, full, full.files);
    toast.success(`Switched to "${full.name}"`);
    return { type: "applied", templateName: full.name };
  }

  const strategy = getTemplateSwitchStrategy(current.category, full.category, {
    sameTemplate: false,
    hasChanges: true,
    isFirstUse: false,
  });

  const oldFull = await window.electronAPI.templateGet(current.id);

  return {
    type: "dialog",
    dialog: {
      open: true,
      level: strategy.level,
      oldName: oldFull?.name || current.id,
      newName: full.name,
      oldCategory: current.category,
      newCategory: full.category,
      changedFiles: changes.changed,
      deletedFiles: changes.deleted,
      newTemplate: full,
      dialogActions: strategy.dialogActions,
    },
  };
}

/**
 * Execute confirmed switch (merge or replace).
 */
export async function confirmApplyTemplate(
  dialog: TemplateSwitchDialogState,
  action: "merge" | "replace",
  ctx: ApplyTemplateFlowContext,
): Promise<void> {
  const { newTemplate, changedFiles, deletedFiles, level } = dialog;
  if (!newTemplate) return;

  const current = ctx.currentTemplate;

  if (level === "firstUse") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupLabel = `${timestamp}_first_use_${newTemplate.id}`;
    await window.electronAPI.templateBackup({
      rootPath: ctx.projectRoot,
      manuscriptDir: ctx.manuscriptDir,
      files: changedFiles,
      backupLabel,
      sourceTemplateId: undefined,
      targetTemplateId: newTemplate.id,
    });
    await applyFiles(ctx, newTemplate, newTemplate.files);
    toast.success(`Template "${newTemplate.name}" applied — previous files backed up`);
    return;
  }

  if (!current) return;

  const allTemplateFiles = [
    ...new Set([
      ...Object.keys(current.appliedFiles),
      ...newTemplate.files.map((f) => f.path),
    ]),
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupLabel = `${timestamp}_${current.id}_to_${newTemplate.id}`;
  await window.electronAPI.templateBackup({
    rootPath: ctx.projectRoot,
    manuscriptDir: ctx.manuscriptDir,
    files: allTemplateFiles,
    backupLabel,
    sourceTemplateId: current.id,
    targetTemplateId: newTemplate.id,
  });

  let filesToApply = newTemplate.files;

  if (action === "merge") {
    const mergedFiles: { path: string; content: string }[] = [];
    for (const newFile of newTemplate.files) {
      const isChanged =
        changedFiles.includes(newFile.path) || deletedFiles.includes(newFile.path);
      let oldContent = "";
      if (isChanged) {
        try {
          const oldResult = await window.electronAPI.fsRead(
            `${ctx.projectRoot}/${ctx.manuscriptDir}/${newFile.path}`,
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
        newTemplate.category,
      );
      mergedFiles.push({ path: newFile.path, content: mergedContent });
    }

    const newFilePaths = new Set(newTemplate.files.map((f) => f.path));
    for (const oldPath of Object.keys(current.appliedFiles)) {
      if (!newFilePaths.has(oldPath)) {
        try {
          const readResult = await window.electronAPI.fsRead(
            `${ctx.projectRoot}/${ctx.manuscriptDir}/${oldPath}`,
          );
          if (readResult?.content) {
            mergedFiles.push({ path: oldPath, content: readResult.content });
          }
        } catch {
          // skip
        }
      }
    }
    filesToApply = mergedFiles;
  }

  await applyFiles(ctx, newTemplate, filesToApply);

  const msg =
    level === "L1"
      ? `Switched to "${newTemplate.name}" — sections and abstract preserved where possible`
      : level === "L2"
        ? `Switched to "${newTemplate.name}" — content merged. Review recommended.`
        : level === "reset"
          ? `"${newTemplate.name}" reset to original — previous content backed up`
          : `Switched to "${newTemplate.name}" — previous content backed up`;
  toast.success(msg);
}
