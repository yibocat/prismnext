/**
 * Typed `window.electronAPI` forwarder.
 * `ElectronAPI` also has data fields (e.g. `platform`); only function keys are allowed.
 */

type DesktopApi = typeof window.electronAPI;
type DesktopFnName = {
  [K in keyof DesktopApi]: DesktopApi[K] extends (...args: never[]) => unknown ? K : never;
}[keyof DesktopApi];

export function forwardDesktop<K extends DesktopFnName>(name: K): DesktopApi[K] {
  return ((...args: unknown[]) => {
    const fn = window.electronAPI?.[name];
    if (typeof fn !== "function") return undefined;
    return (fn as (...a: unknown[]) => unknown)(...args);
  }) as DesktopApi[K];
}
