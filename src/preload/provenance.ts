import { ipcRenderer } from "electron";

export const provenanceApi = {
	// Provenance - trace a claimed artifact / run back to its generating command.
	provenanceGetForArtifact: (projectRoot: string, artifactPath: string) =>
		ipcRenderer.invoke("provenance:getForArtifact", { projectRoot, artifactPath }),
	provenanceGetForRun: (projectRoot: string, runId: string) =>
		ipcRenderer.invoke("provenance:getForRun", { projectRoot, runId }),
};
