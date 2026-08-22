import { getHostEvents } from "../app/event-sink";

export interface AgentCompilePreviewPayload {
  projectDir: string;
  success: boolean;
  mainFile?: string;
  pdfBytes?: Buffer;
  error?: string;
  logTail?: string;
}

/** Push agent-side compile results to the renderer PDF preview (Tex workspace). */
export function notifyAgentCompilePreview(payload: AgentCompilePreviewPayload): void {
  getHostEvents().broadcast("compile:agentComplete", {
    projectDir: payload.projectDir,
    success: payload.success,
    mainFile: payload.mainFile ?? "",
    error: payload.error ?? "",
    logTail: payload.logTail ?? "",
    ...(payload.pdfBytes ? { pdfBytes: payload.pdfBytes } : {}),
  });
}
