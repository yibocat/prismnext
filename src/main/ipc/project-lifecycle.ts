import { ipcMain } from "electron";
import * as filesystem from "../services/filesystem";
import {
  projectLifecycleAuthority,
  type ProjectLifecycleAuthority,
} from "../services/project-lifecycle-authority";
import { clearRoots, registerProjectRoot } from "../services/active-project-roots";

type WatcherLifecycle = Pick<typeof filesystem, "stopWatching">;

/**
 * Owns project-open/close side effects that must happen before filesystem
 * watchers are allowed to create their app-owned metadata directories.
 */
export function registerProjectLifecycleHandlers(
  watcher: WatcherLifecycle = filesystem,
  authority: ProjectLifecycleAuthority = projectLifecycleAuthority,
): void {
  ipcMain.handle("project:open", async (_event, args: { rootPath: string }) => {
    const rootPath = await authority.resolveRoot(args.rootPath);
    const previousRoot = authority.currentRoot;
    if (previousRoot !== rootPath && previousRoot) {
      await watcher.stopWatching();
    }

    const transition = authority.activate(rootPath);
    if (transition.changed) {
      clearRoots();
      registerProjectRoot(rootPath);
    }
    return { rootPath };
  });

  ipcMain.handle("project:close", async () => {
    await watcher.stopWatching();
    authority.close();
    clearRoots();
  });
}
