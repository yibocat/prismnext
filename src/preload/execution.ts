import { ipcRenderer } from "electron";
import type { ExecutionApplyProjectSwitchArgs, ExecutionApplyProjectSwitchResult, ExecutionCancelResult, ExecutionFindByToolCallIdResult, ExecutionGetResult, ExecutionListRunningResult, ExecutionReplayArgs, ExecutionReplayResult, ExecutionRerunResult, TerminalExecutionEvent } from "../shared/execution";

export const executionApi = {
	executionGet: (executionId: string): Promise<ExecutionGetResult> =>
		ipcRenderer.invoke("execution:get", { executionId }),
	executionFindByToolCallId: (toolCallId: string): Promise<ExecutionFindByToolCallIdResult> =>
		ipcRenderer.invoke("execution:findByToolCallId", { toolCallId }),
	executionReplay: (args: ExecutionReplayArgs): Promise<ExecutionReplayResult> =>
		ipcRenderer.invoke("execution:replay", args),
	executionCancel: (executionId: string): Promise<ExecutionCancelResult> =>
		ipcRenderer.invoke("execution:cancel", { executionId }),
	executionRerun: (executionId: string): Promise<ExecutionRerunResult> =>
		ipcRenderer.invoke("execution:rerun", { executionId }),
	executionListRunning: (): Promise<ExecutionListRunningResult> =>
		ipcRenderer.invoke("execution:listRunning"),
	executionApplyProjectSwitch: (
		args: ExecutionApplyProjectSwitchArgs,
	): Promise<ExecutionApplyProjectSwitchResult> =>
		ipcRenderer.invoke("execution:applyProjectSwitch", args),
	onExecutionEvent: (listener: (event: TerminalExecutionEvent) => void) => {
		const handler = (_event: Electron.IpcRendererEvent, payload: TerminalExecutionEvent) =>
			listener(payload);
		ipcRenderer.on("execution:event", handler);
		return () => ipcRenderer.removeListener("execution:event", handler);
	},
};
