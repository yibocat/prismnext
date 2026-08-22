import { webUtils } from "electron";

export const platformApi = {
	// Platform info
	platform: process.platform as "darwin" | "win32" | "linux",
	getPathForFile: (file: File) => webUtils.getPathForFile(file),
};
