/**
 * Experiment desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by experiment-store.
 */

import { forwardDesktop } from "./forward";

export const experimentDesktop = {
  experimentList: forwardDesktop("experimentList"),
  experimentArchive: forwardDesktop("experimentArchive"),
  experimentRestore: forwardDesktop("experimentRestore"),
  experimentDelete: forwardDesktop("experimentDelete"),
  experimentCreate: forwardDesktop("experimentCreate"),
  experimentUpdate: forwardDesktop("experimentUpdate"),
  experimentUpdateRun: forwardDesktop("experimentUpdateRun"),
  experimentRead: forwardDesktop("experimentRead"),
  experimentDetectEnv: forwardDesktop("experimentDetectEnv"),
  experimentRun: forwardDesktop("experimentRun"),
  experimentCancelRun: forwardDesktop("experimentCancelRun"),
  experimentSnapshot: forwardDesktop("experimentSnapshot"),
  experimentGetPaths: forwardDesktop("experimentGetPaths"),
  onExperimentRunComplete: forwardDesktop("onExperimentRunComplete"),
  onExperimentRunStarted: forwardDesktop("onExperimentRunStarted"),
  onExperimentRunOutput: forwardDesktop("onExperimentRunOutput"),
  onExperimentChanged: forwardDesktop("onExperimentChanged"),
  provenanceGetForArtifact: forwardDesktop("provenanceGetForArtifact"),
  provenanceGetForRun: forwardDesktop("provenanceGetForRun"),
};
