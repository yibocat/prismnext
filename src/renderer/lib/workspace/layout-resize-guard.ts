/**
 * Suppresses App.tsx center-panel onResize threshold (20px → editorMaximized)
 * during programmatic collapse/expand so layout orchestration does not fight itself.
 */
let programmaticCenterResizeDepth = 0;

/** Suppresses passive center shrink → maximize during window resize (reconcile owns that). */
let windowLayoutResizeDepth = 0;

export function runWithProgrammaticCenterResize(fn: () => void): void {
  programmaticCenterResizeDepth += 1;
  try {
    fn();
  } finally {
    // Panel `onResize` is ResizeObserver-driven (async). Keep the guard until
    // after the next paint so maximize/collapse is not immediately undone by a
    // stale or in-flight size callback seeing center still ≥ 20px.
    const release = () => {
      programmaticCenterResizeDepth -= 1;
    };
    if (typeof requestAnimationFrame === "undefined") {
      queueMicrotask(release);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(release);
    });
  }
}

export function isProgrammaticCenterResize(): boolean {
  return programmaticCenterResizeDepth > 0;
}

/** Run layout reconciliation during window resize; blocks center onResize auto-maximize. */
export function runDuringWindowLayoutResize(fn: () => void): void {
  windowLayoutResizeDepth += 1;
  try {
    fn();
  } finally {
    windowLayoutResizeDepth -= 1;
  }
}

export function isWindowLayoutResizing(): boolean {
  return windowLayoutResizeDepth > 0;
}
