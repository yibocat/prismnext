import { ipcRenderer } from "electron";

export const zoteroApi = {
	zoteroProbe: () => ipcRenderer.invoke("zotero:probe"),
	zoteroStatus: () => ipcRenderer.invoke("zotero:status"),
	zoteroListCollections: () => ipcRenderer.invoke("zotero:listCollections"),
	zoteroGetProjectBinding: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:getProjectBinding", { projectRoot }),
	zoteroSetProjectBinding: (
		projectRoot: string,
		collectionId: string | null,
		collectionName?: string | null,
	) =>
		ipcRenderer.invoke("zotero:setProjectBinding", {
			projectRoot,
			collectionId,
			collectionName,
		}),
	zoteroPullCollections: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:pullCollections", { projectRoot }),
	zoteroPullCollection: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:pullCollection", { projectRoot }),
	zoteroGetLastSync: (projectRoot: string) =>
		ipcRenderer.invoke("zotero:getLastSync", { projectRoot }),
};
