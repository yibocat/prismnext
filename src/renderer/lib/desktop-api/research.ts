/**
 * Research-plan desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by chat-store plan actions.
 */

import { forwardDesktop } from "./forward";

export const researchDesktop = {
  researchPlanHasPendingDraft: forwardDesktop("researchPlanHasPendingDraft"),
  researchPlanClaimDraft: forwardDesktop("researchPlanClaimDraft"),
  researchPlanReadDraft: forwardDesktop("researchPlanReadDraft"),
  researchPlanPromoteDraft: forwardDesktop("researchPlanPromoteDraft"),
  researchPlanDiscardDraft: forwardDesktop("researchPlanDiscardDraft"),
  researchBriefEnsure: forwardDesktop("researchBriefEnsure"),
  researchBriefRead: forwardDesktop("researchBriefRead"),
  researchBriefGetPath: forwardDesktop("researchBriefGetPath"),
};
