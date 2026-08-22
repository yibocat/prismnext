import { ipcRenderer } from "electron";

export const fsApi = {
	// Filesystem operations
	fsScan: (rootPath: string) => ipcRenderer.invoke("fs:scan", { rootPath }),
	fsScanMetadata: (rootPath: string) => ipcRenderer.invoke("fs:scanMetadata", { rootPath }),
	fsRead: (absPath: string) => ipcRenderer.invoke("fs:read", { absPath }),
	fsReadBatch: (absPaths: string[]) => ipcRenderer.invoke("fs:readBatch", { absPaths }),
	fsReadImage: (absPath: string) =>
		ipcRenderer.invoke("fs:readImage", { absPath }),
	fsStat: (absPath: string) =>
		ipcRenderer.invoke("fs:stat", { absPath }),
	fsReadBytes: (absPath: string) =>
		ipcRenderer.invoke("fs:readBytes", { absPath }) as Promise<{ bytes: ArrayBuffer }>,
	fsWrite: (absPath: string, content: string) =>
		ipcRenderer.invoke("fs:write", { absPath, content }),
	fsCreate: (rootPath: string, relativePath: string, content: string) =>
		ipcRenderer.invoke("fs:create", { rootPath, relativePath, content }),
	fsDelete: (absPath: string) => ipcRenderer.invoke("fs:delete", { absPath }),
	fsDeleteFolder: (absPath: string) =>
		ipcRenderer.invoke("fs:deleteFolder", { absPath }),
	fsRename: (oldPath: string, newPath: string) =>
		ipcRenderer.invoke("fs:rename", { oldPath, newPath }),
	fsMkdir: (absPath: string) => ipcRenderer.invoke("fs:mkdir", { absPath }),
	// File watcher
	fsWatchStart: () => ipcRenderer.invoke("fs:watch-start"),
	fsWatchStop: () => ipcRenderer.invoke("fs:watch-stop"),
	fsExists: (absPath: string) => ipcRenderer.invoke("fs:exists", { absPath }),
	fsIsFile: (absPath: string) => ipcRenderer.invoke("fs:isFile", { absPath }),
	fsFindByBasename: (projectRoot: string, basename: string) =>
		ipcRenderer.invoke("fs:findByBasename", { projectRoot, basename }),
	// File watcher events (Main → Renderer)
	onFileChanged: (callback: (data: { projectRoot: string; changedPaths?: string[] }) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: { projectRoot: string; changedPaths?: string[] }) => callback(data);
		ipcRenderer.on("fs:fileChanged", handler);
		return () => ipcRenderer.removeListener("fs:fileChanged", handler);
	},
};
