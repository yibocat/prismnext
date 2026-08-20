import { ipcMain } from "electron";
import { basename } from "node:path";
import * as filesystem from "../services/filesystem";
import {
  projectLifecycleAuthority,
  type ProjectLifecycleAuthority,
} from "../services/project-lifecycle-authority";
import { clearRoots, registerProjectRoot } from "../services/active-project-roots";
import { createLogger, shortLogDetail } from "../services/logger";

const log = createLogger("project-lifecycle", "startup");

type WatcherLifecycle = Pick<typeof filesystem, "stopWatching">;

/**
 * Owns project-open/close side effects that must happen before filesystem
 * watchers are allowed to create their app-owned metadata directories.
 *
 * `project:open` only validates and returns the canonical root. Authorization
 * and watcher teardown happen in `project:activate` / `project:close`, which
 * the renderer calls when the UI actually commits or abandons the project.
 */
export function registerProjectLifecycleHandlers(
  watcher: WatcherLifecycle = filesystem,
  authority: ProjectLifecycleAuthority = projectLifecycleAuthority,
): void {
  ipcMain.handle("project:open", async (_event, args: { rootPath: string }) => {
    const rootPath = await authority.resolveRoot(args.rootPath);
    return { rootPath };
  });

  ipcMain.handle("project:activate", async (_event, args: { rootPath: string }) => {
    try {
      const rootPath = await authority.resolveRoot(args.rootPath);
      const previousRoot = authority.currentRoot;
      if (previousRoot !== rootPath && previousRoot) {
        await watcher.stopWatching();
      }

      const transition = authority.activate(rootPath);
      if (transition.changed) {
        clearRoots();
        registerProjectRoot(rootPath);
        log.info("project.activate", {
          from: previousRoot ? basename(previousRoot) : undefined,
          to: basename(rootPath),
        });
      }
      return { rootPath };
    } catch (err) {
      log.warn("project.activate", {
        to: args?.rootPath ? basename(args.rootPath) : undefined,
        error: shortLogDetail(err),
      });
      throw err;
    }
  });

  ipcMain.handle("project:close", async () => {
    const previousRoot = authority.currentRoot;
    await watcher.stopWatching();
    authority.close();
    clearRoots();
    if (previousRoot) {
      log.info("project.close", { project: basename(previousRoot) });
    }
  });
}
