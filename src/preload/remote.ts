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
	remoteMkdir: (
		input: { profileId: string; path: string },
	): Promise<{ ok: true; path: string }> =>
		ipcRenderer.invoke("remote:mkdir", input),
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
	remoteZoteroCancel: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("remote:zoteroCancel"),
	onRemoteZoteroProgress: (
		listener: (progress: { current: number; total: number; title: string }) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			progress: { current: number; total: number; title: string },
		) => listener(progress);
		ipcRenderer.on("remote:zoteroProgress", handler);
		return () => ipcRenderer.removeListener("remote:zoteroProgress", handler);
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
	remoteGetSyncMode: (profileId: string): Promise<{ mode: import("../shared/remote").RemoteSyncMode }> =>
		ipcRenderer.invoke("remote:getSyncMode", { profileId }),
	remoteSetSyncMode: (
		profileId: string,
		mode: import("../shared/remote").RemoteSyncMode,
	): Promise<{ mode: import("../shared/remote").RemoteSyncMode }> =>
		ipcRenderer.invoke("remote:setSyncMode", { profileId, mode }),
	remoteSyncFile: (input: {
		profileId: string;
		projectId: string;
		remoteAbs: string;
		destRel?: string;
	}): Promise<{ ok: true; path: string; skipped?: string } | { ok: false; error: string }> =>
		ipcRenderer.invoke("remote:syncFile", input),
	remoteSyncPaperPdf: (input: {
		projectRoot: string;
		paperId: string;
		projectId: string;
	}): Promise<{ ok: true; path: string } | { ok: false; error: string }> =>
		ipcRenderer.invoke("remote:syncPaperPdf", input),
	remoteSyncExperimentArtifacts: (input: {
		projectRoot: string;
		projectId: string;
		experimentId: string;
	}): Promise<{ ok: true; paths: string[]; skipped: number }> =>
		ipcRenderer.invoke("remote:syncExperimentArtifacts", input),
	remoteSyncSessions: (input: {
		profileId: string;
		projectId: string;
	}): Promise<{ ok: true; count: number }> => ipcRenderer.invoke("remote:syncSessions", input),
	remoteSyncCancel: (): Promise<{ ok: boolean }> => ipcRenderer.invoke("remote:syncCancel"),
	remotePushSkills: (profileId: string): Promise<{ ok: true; files: number } | { ok: false; error: string }> =>
		ipcRenderer.invoke("remote:pushSkills", { profileId }),
	onRemoteSyncProgress: (
		listener: (progress: import("../shared/remote").RemoteSyncProgress) => void,
	) => {
		const handler = (
			_event: Electron.IpcRendererEvent,
			progress: import("../shared/remote").RemoteSyncProgress,
		) => listener(progress);
		ipcRenderer.on("remote:syncProgress", handler);
		return () => ipcRenderer.removeListener("remote:syncProgress", handler);
	},
};
