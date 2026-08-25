import {
  isPlausibleRemoteUrl,
  isValidRemoteName,
  parseRemoteVerbose,
  resolvePushRemote,
} from "../../shared/git";
import type { GitAddRemoteResultData, GitRemoteInfo } from "../../shared/git";
import { execGit, execGitOrNull } from "./exec";

export { resolvePushRemote };

export async function listRemotes(projectRoot: string): Promise<GitRemoteInfo[]> {
  const output = await execGitOrNull(projectRoot, ["remote", "-v"]);
  return parseRemoteVerbose(output);
}

export async function addRemote(
  projectRoot: string,
  input: { name: string; url: string },
): Promise<GitAddRemoteResultData> {
  const name = input.name.trim();
  const url = input.url.trim();
  const remotes = await listRemotes(projectRoot);
  if (!isValidRemoteName(name)) {
    return { success: false, error: "invalid_remote_name", remotes };
  }
  if (!isPlausibleRemoteUrl(url)) {
    return { success: false, error: "invalid_remote_url", remotes };
  }
  if (remotes.some((remote) => remote.name === name)) {
    return { success: false, error: "remote_exists", remotes };
  }
  try {
    await execGit(projectRoot, ["remote", "add", name, url]);
    return { success: true, remotes: await listRemotes(projectRoot) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      remotes: await listRemotes(projectRoot),
    };
  }
}

export async function readBranchPushRemote(
  projectRoot: string,
  branch: string,
): Promise<string | null> {
  if (!branch || branch === "HEAD") return null;
  const value = await execGitOrNull(projectRoot, [
    "config",
    "--get",
    `branch.${branch}.pushRemote`,
  ]);
  return value?.trim() || null;
}
