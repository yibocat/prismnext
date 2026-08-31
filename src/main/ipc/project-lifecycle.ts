import { ipcMain } from "electron";
import { basename } from "node:path";
import * as filesystem from "../project/filesystem";
import {
  projectLifecycleAuthority,
  type ProjectLifecycleAuthority,
} from "../project/project-lifecycle-authority";
import { clearRoots, replaceRegisteredRoots } from "../project/active-project-roots";
import { isRemoteProjectRoot, parseRemoteAbs, recoverRemoteAbs } from "../../shared/remote";
import { listWorkbenchMembers } from "../workbench/default-project";
import { createLogger, shortLogDetail } from "../app/logger";
import { getRemoteSessionBroker } from "./remote";

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
function defaultMemberRoots(): string[] {
  try {
    return listWorkbenchMembers().map((member) => member.lastPath);
  } catch {
    return [];
  }
}

export function registerProjectLifecycleHandlers(
  watcher: WatcherLifecycle = filesystem,
  authority: ProjectLifecycleAuthority = projectLifecycleAuthority,
  memberRoots: () => string[] = defaultMemberRoots,
): void {
  ipcMain.handle("project:open", async (_event, args: { rootPath: string }) => {
    const remote = recoverRemoteAbs(args.rootPath);
    if (remote) {
      const parsed = parseRemoteAbs(remote);
      if (parsed) {
        await getRemoteSessionBroker().ensureProjectOpen(parsed.profileId, parsed.abs);
      }
      return { rootPath: remote };
    }
    const rootPath = await authority.resolveRoot(args.rootPath);
    return { rootPath };
  });

  ipcMain.handle("project:activate", async (_event, args: { rootPath: string }) => {
    try {
      const remote = recoverRemoteAbs(args.rootPath);
      if (remote) {
        const previousRoot = authority.currentRoot;
        if (previousRoot !== remote && previousRoot) {
          await watcher.stopWatching();
          void import("../compile/tinymist-session").then((m) => {
            void m.disposeTinymistSession(previousRoot);
          });
        }
        authority.activate(remote);
        replaceRegisteredRoots(memberRoots().filter((root) => !isRemoteProjectRoot(root)));
        return { rootPath: remote };
      }
      const rootPath = await authority.resolveRoot(args.rootPath);
      const previousRoot = authority.currentRoot;
      if (previousRoot !== rootPath && previousRoot) {
        await watcher.stopWatching();
        void import("../compile/tinymist-session").then((m) => {
          void m.disposeTinymistSession(previousRoot);
        });
      }

      const transition = authority.activate(rootPath);
      replaceRegisteredRoots(
        [rootPath, ...memberRoots()].filter((root) => !isRemoteProjectRoot(root)),
      );
      if (transition.changed) {
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
      void import("../compile/tinymist-session").then((m) => {
        void m.disposeTinymistSession(previousRoot);
      });
      log.info("project.close", { project: basename(previousRoot) });
    }
  });
}
