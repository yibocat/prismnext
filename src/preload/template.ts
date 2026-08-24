import { ipcRenderer } from "electron";

export const templateApi = {
	// Template
	templateList: () => ipcRenderer.invoke("template:list"),
	templateGet: (templateId: string) => ipcRenderer.invoke("template:get", { templateId }),
	templatePreview: (templateId: string) => ipcRenderer.invoke("template:preview", { templateId }),
	templateApply: (args: {
		rootPath: string;
		manuscriptDir: string;
		files: { path: string; content: string }[];
		templateId: string;
		templateCategory: string;
	}) => ipcRenderer.invoke("template:apply", args),
	templateGetPdfData: (templateId: string) => ipcRenderer.invoke("template:getPdfData", { templateId }),
	templateDetectChanges: (args: {
		rootPath: string;
		manuscriptDir: string;
		appliedFiles: Record<string, string>;
	}) => ipcRenderer.invoke("template:detectChanges", args),
	templateBackup: (args: {
    rootPath: string;
    manuscriptDir: string;
    files: string[];
    backupLabel: string;
    sourceTemplateId?: string;
    targetTemplateId?: string;
  }) => ipcRenderer.invoke("template:backup", args),
	templateListBackups: (args: { rootPath: string }) =>
		ipcRenderer.invoke("template:listBackups", args),
	templateRestoreBackup: (args: {
		rootPath: string;
		manuscriptDir: string;
		backupLabel: string;
	}) => ipcRenderer.invoke("template:restoreBackup", args),
	templateDeleteBackup: (args: { rootPath: string; backupLabel: string }) =>
		ipcRenderer.invoke("template:deleteBackup", args),
};
