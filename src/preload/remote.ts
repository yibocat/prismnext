import { ipcRenderer } from "electron";
import type {
  RemoteBootstrapLogLine,
  RemoteConnectionSnapshot,
  RemoteConnectionState,
  RemoteConnectResult,
  SshConfigHost,
} from "../shared/remote";

export const remoteApi = {
	remoteListHosts: (): Promise<SshConfigHost[]> => ipcRenderer.invoke("remote:listHosts"),
	remoteTrustHost: (input: { host: string; port: number; fingerprint: string }): Promise<void> =>
		ipcRenderer.invoke("remote:trustHost", input),
	remoteConnect: (profileId: string): Promise<RemoteConnectResult> =>
		ipcRenderer.invoke("remote:connect", { profileId }),
	remoteDisconnect: (profileId: string): Promise<void> =>
		ipcRenderer.invoke("remote:disconnect", { profileId }),
	remoteConnectionStatus: (profileId?: string): Promise<RemoteConnectionState | RemoteConnectionSnapshot> =>
		ipcRenderer.invoke("remote:connectionStatus", profileId ? { profileId } : {}),
	remoteListDir: (
		input: { profileId: string; path: string },
	): Promise<import("../shared/remote").RemoteDirListing> =>
		ipcRenderer.invoke("remote:listDir", input),
	remoteOpenProject: (
		input: { profileId: string; remoteRoot: string },
	): Promise<{
		projectId: string;
		remoteRoot: string;
		connectionId: string;
		lastPath: string;
		handle: import("../shared/remote").RemoteProjectHandle;
	}> => ipcRenderer.invoke("remote:openProject", input),
	onRemoteLog: (listener: (line: RemoteBootstrapLogLine) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, line: RemoteBootstrapLogLine) => listener(line);
		ipcRenderer.on("remote:log", handler);
		return () => ipcRenderer.removeListener("remote:log", handler);
	},
	onRemoteConnection: (
		listener: (payload: { profileId: string; state: RemoteConnectionState }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			payload: { profileId: string; state: RemoteConnectionState },
		) => listener(payload);
		ipcRenderer.on("remote:connection", handler);
		return () => ipcRenderer.removeListener("remote:connection", handler);
	},
};
