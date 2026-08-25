import { existsSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import { RemoteOperationError, normalizePosixAbs, posixContained } from "../shared/remote";

function realPosix(abs: string): string | null {
  try {
    return normalizePosixAbs(realpathSync(abs));
  } catch {
    return null;
  }
}

function underRealRoot(realRoot: string, realPath: string): boolean {
  return realPath === realRoot || realPath.startsWith(`${realRoot}/`);
}

export function assertContained(remoteRoot: string, candidate: string): string {
  const contained = posixContained(remoteRoot, candidate);
  if (!contained) {
    throw new RemoteOperationError("path_escaped", `Path escaped remote root: ${candidate}`);
  }
  const realRoot = realPosix(remoteRoot);
  if (!realRoot) {
    throw new RemoteOperationError("path_escaped", `Remote root is not on disk: ${remoteRoot}`);
  }
  let probe = contained;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = existsSync(probe) ? realPosix(probe) : null;
  if (realProbe && !underRealRoot(realRoot, realProbe)) {
    throw new RemoteOperationError("path_escaped", `Path escaped remote root: ${candidate}`);
  }
  return contained;
}
