import { ipcRenderer } from "electron";
import type { GhPrCreateInput } from "../shared/git-hosting";

export const gitHostingApi = {
	gitHostingAuthStatus: (projectRoot: string) =>
		ipcRenderer.invoke("git-hosting:ghAuthStatus", { projectRoot }),
	gitHostingPrCreate: (input: GhPrCreateInput) =>
		ipcRenderer.invoke("git-hosting:ghPrCreate", input),
	gitHostingPrViewWeb: (projectRoot: string, url?: string) =>
		ipcRenderer.invoke("git-hosting:ghPrViewWeb", { projectRoot, url }),
};
