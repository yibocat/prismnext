import { getHostEvents } from "../app/event-sink";
import type { CompileEngine, CompileRoute } from "../../shared/compile/artifact-key";

export interface AgentCompilePreviewPayload {
  projectDir: string;
  projectRoot?: string;
  engine: CompileEngine;
  route: CompileRoute;
  compileRoot: string;
  sourceFile?: string;
  pdfRel: string;
  success: boolean;
  mainFile?: string;
  pdfBytes?: Buffer;
  error?: string;
  errors?: Array<{ file?: string; line?: number; message: string }>;
  logTail?: string;
  source?: "ui" | "agent";
}

/** Push agent-side compile results to the renderer PDF preview (Files tab). */
export function notifyAgentCompilePreview(payload: AgentCompilePreviewPayload): void {
  getHostEvents().broadcast("compile:agentComplete", {
    projectDir: payload.projectDir,
    projectRoot: payload.projectRoot ?? payload.projectDir,
    engine: payload.engine,
    route: payload.route,
    compileRoot: payload.compileRoot,
    sourceFile: payload.sourceFile ?? "",
    pdfRel: payload.pdfRel,
    success: payload.success,
    mainFile: payload.mainFile ?? payload.compileRoot,
    error: payload.error ?? "",
    logTail: payload.logTail ?? "",
    source: payload.source ?? "agent",
    ...(payload.errors ? { errors: payload.errors } : {}),
    ...(payload.pdfBytes ? { pdfBytes: payload.pdfBytes } : {}),
  });
}
