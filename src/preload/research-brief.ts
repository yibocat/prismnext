import { ipcRenderer } from "electron";

export const researchBriefApi = {
	researchBriefEnsure: (projectRoot: string) =>
		ipcRenderer.invoke("researchBrief:ensure", { projectRoot }),
	researchBriefRead: (projectRoot: string) =>
		ipcRenderer.invoke("researchBrief:read", { projectRoot }),
	researchBriefGetPath: (projectRoot: string) =>
		ipcRenderer.invoke("researchBrief:getPath", { projectRoot }),
	researchBriefUpdateSection: (args: {
		projectRoot: string;
		section: string;
		content: string;
		append?: boolean;
	}) => ipcRenderer.invoke("researchBrief:updateSection", args),
};
