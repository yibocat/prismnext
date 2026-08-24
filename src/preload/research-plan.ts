import { ipcRenderer } from "electron";

export const researchPlanApi = {
	researchPlanWrite: (args: {
		projectRoot: string;
		doc: import("../shared/research/plan").ResearchPlanDoc;
	}) => ipcRenderer.invoke("researchPlan:write", args),
	researchPlanReadDraft: (args: { projectRoot: string; sessionId?: string }) =>
		ipcRenderer.invoke("researchPlan:readDraft", args),
	researchPlanClaimDraft: (args: { projectRoot: string; sessionId: string }) =>
		ipcRenderer.invoke("researchPlan:claimDraft", args),
	researchPlanHasPendingDraft: (args: { projectRoot: string; sessionId: string }) =>
		ipcRenderer.invoke("researchPlan:hasPendingDraft", args),
	researchPlanPromoteDraft: (args: {
		projectRoot: string;
		sessionId?: string;
		/** @deprecated Ignored — promote always renames draft to approved. */
		status?: "approved" | "snapshot";
	}) => ipcRenderer.invoke("researchPlan:promoteDraft", args),
	researchPlanDiscardDraft: (args: { projectRoot: string; sessionId?: string }) =>
		ipcRenderer.invoke("researchPlan:discardDraft", args),
};
