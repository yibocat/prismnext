import { ipcRenderer } from "electron";

export const proLicenseApi = {
	// Pro license (open-core activation; Free builds have no private Pro module)
	proGetLicense: () => ipcRenderer.invoke("pro:getLicense"),
	proActivate: (rawKey: string) => ipcRenderer.invoke("pro:activate", rawKey),
	proClearLicense: () => ipcRenderer.invoke("pro:clearLicense"),
};
