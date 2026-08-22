/**
 * Experiment desktop port.
 * Forwards to `window.electronAPI` — do not redefine DTOs here.
 * Used by experiment-store.
 */

type DesktopApi = typeof window.electronAPI;

function forward<K extends keyof DesktopApi>(name: K): DesktopApi[K] {
  return ((...args: Parameters<DesktopApi[K]>) => {
    const fn = window.electronAPI?.[name];
    return typeof fn === "function" ? (fn as DesktopApi[K])(...args) : undefined;
  }) as DesktopApi[K];
}

export const experimentDesktop = {
  experimentList: forward("experimentList"),
  experimentArchive: forward("experimentArchive"),
  experimentRestore: forward("experimentRestore"),
  experimentDelete: forward("experimentDelete"),
  experimentCreate: forward("experimentCreate"),
  experimentUpdate: forward("experimentUpdate"),
  experimentUpdateRun: forward("experimentUpdateRun"),
  experimentRead: forward("experimentRead"),
  experimentDetectEnv: forward("experimentDetectEnv"),
  experimentRun: forward("experimentRun"),
  experimentCancelRun: forward("experimentCancelRun"),
  experimentSnapshot: forward("experimentSnapshot"),
  experimentGetPaths: forward("experimentGetPaths"),
  onExperimentRunComplete: forward("onExperimentRunComplete"),
  onExperimentRunStarted: forward("onExperimentRunStarted"),
  onExperimentRunOutput: forward("onExperimentRunOutput"),
};
