/**
 * Literature extract desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by literature-extract-store. Paper materialized / AI-metadata events stay on literatureDesktop.
 */

import { forwardDesktop } from "./forward";

export const extractDesktop = {
  extractList: forwardDesktop("extractList"),
  extractEnqueue: forwardDesktop("extractEnqueue"),
  extractCancel: forwardDesktop("extractCancel"),
  extractRetry: forwardDesktop("extractRetry"),
  extractEnqueueBatch: forwardDesktop("extractEnqueueBatch"),
  extractEnqueueCollection: forwardDesktop("extractEnqueueCollection"),
  extractResume: forwardDesktop("extractResume"),
  onExtractStatusChanged: forwardDesktop("onExtractStatusChanged"),
  onExtractProgress: forwardDesktop("onExtractProgress"),
  onExtractProgressClear: forwardDesktop("onExtractProgressClear"),
  onExtractPdfCached: forwardDesktop("onExtractPdfCached"),
  onExtractAgentRequested: forwardDesktop("onExtractAgentRequested"),
};
